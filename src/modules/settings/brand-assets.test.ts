import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { BrandAssets } from './brand-assets';

test('landing assets preserve a large WebP derivative and use existing art when unconfigured', async () => {
  const saved = new Map<string, Buffer>();
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) { saved.set(args[0] as string, args[1] as Buffer); return []; }
    return saved.has(args[0] as string) ? [{ data: saved.get(args[0] as string) }] : [];
  } } as unknown as DataSource;
  const assets = new BrandAssets(db);
  assert.equal(await assets.read('hero'), null);
  assert.equal(await assets.read('about'), null);
  const bytes = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#abc123' } }).png().toBuffer();
  for (const kind of ['hero', 'about']) {
    await assets.upload(kind, { buffer: bytes, size: bytes.length });
    const info = await sharp((await assets.read(kind))!).metadata();
    assert.equal(info.format, 'webp'); assert.equal(info.width, 1600); assert.equal(info.height, 800);
  }
});

test('normalizes a logo into a bounded PNG and persists only the selected asset', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = { isInitialized: true, query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return []; } } as unknown as DataSource;
  const bytes = await sharp({ create: { width: 640, height: 320, channels: 4, background: '#bada55' } }).png().toBuffer();
  await new BrandAssets(db).upload('logo', { buffer: bytes, size: bytes.length });
  assert.equal(calls.length, 1); assert.equal(calls[0].params[0], 'logo');
  const saved = calls[0].params[1] as Buffer, info = await sharp(saved).metadata();
  assert.equal(info.format, 'png'); assert.equal(info.width, 320); assert.equal(info.height, 160);
});

test('rejects unknown asset kinds and invalid data without storage', async () => {
  const assets = new BrandAssets();
  await assert.rejects(assets.upload('other', { buffer: Buffer.from('bad'), size: 3 }), { status: 400 });
  await assert.rejects(assets.upload('icon', { buffer: Buffer.from('bad'), size: 3 }), { status: 400 });
});

test('a missing configured asset returns a valid transparent fallback', async () => {
  const db = { isInitialized: true, query: async () => [] } as unknown as DataSource;
  const info = await sharp(await new BrandAssets(db).read('icon')).metadata();
  assert.equal(info.format, 'png'); assert.equal(info.width, 1); assert.equal(info.height, 1);
  const pixels = await sharp(await new BrandAssets(db).read('icon')).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[3], 0);
  await assert.rejects(new BrandAssets(db).read('unknown'), { status: 400 });
});

test('pending branding migration preserves public defaults without concealing other database errors', async () => {
  const db = { isInitialized: true, query: async () => { throw Object.assign(Error('Missing table'), { code: 'ER_NO_SUCH_TABLE' }); } } as unknown as DataSource;
  assert.equal(await new BrandAssets(db).read('hero'), null);
  assert.equal((await sharp(await new BrandAssets(db).read('logo')).metadata()).format, 'png');
  const offline = { isInitialized: true, query: async () => { throw Error('Connection failed'); } } as unknown as DataSource;
  await assert.rejects(new BrandAssets(offline).read('hero'), /Connection failed/);
});
