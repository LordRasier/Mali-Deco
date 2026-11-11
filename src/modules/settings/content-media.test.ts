import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { ContentMedia, AdminContentMediaController } from './content-media';
import { defaultContentConfig } from './content-config';
import { OwnerGuard } from '../identity/http/owner.guard';
test('independent uploads remain private until referenced by published composition', async () => {
  const config = defaultContentConfig(), storage = new Map<string, Buffer>();
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) { storage.set(String(args[0]), args[1] as Buffer); return {}; }
    const data = storage.get(String(args[0])); return data ? [{ data }] : [];
  } } as unknown as DataSource;
  const service = new ContentMedia({ get: async () => ({ settings: config, revision: 0, available: true }) }, db);
  assert.deepEqual(Reflect.getMetadata('__guards__', AdminContentMediaController), [OwnerGuard]);
  const buffer = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#4488cc' } }).png().toBuffer();
  const first = await service.upload({ buffer, size: buffer.length }), second = await service.upload({ buffer, size: buffer.length });
  assert.notEqual(first.url, second.url); assert.equal(storage.size, 2);
  await assert.rejects(service.read(first.id, true), { status: 404 }); await service.read(first.id, false);
  config.landing.blocks[0].props.image = first.url; await service.read(first.id, true); await assert.rejects(service.read(second.id, true), { status: 404 });
  config.landing.blocks[0].props.image = ''; await assert.rejects(service.read(first.id, true), { status: 404 });
  await assert.rejects(service.upload({ buffer: Buffer.from('<svg/>'), size: 6 }), { status: 400 });
  await assert.rejects(service.read('../other', false), { status: 404 });
});
