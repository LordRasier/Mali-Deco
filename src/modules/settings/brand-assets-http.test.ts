import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/http/owner.guard';
import { AdminBrandAssetsController, BrandAssets, PublicBrandAssetsController } from './brand-assets';

test('multipart brand upload and public image use the fixed local API contract', async () => {
  const saved = new Map<string, Buffer>();
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) { saved.set(args[0] as string, args[1] as Buffer); return []; }
    const data = saved.get(args[0] as string); return data ? [{ data }] : [];
  } } as unknown as DataSource;
  const module = await Test.createTestingModule({ controllers: [AdminBrandAssetsController, PublicBrandAssetsController], providers: [
    { provide: BrandAssets, useValue: new BrandAssets(db) }, { provide: OwnerGuard, useValue: { canActivate: () => true } },
  ] }).overrideGuard(OwnerGuard).useValue({ canActivate: () => true }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1'); const origin = await app.getUrl();
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#abc123' } }).png().toBuffer();
    const body = new FormData(); body.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'icon.png');
    const response = await fetch(origin + '/admin/settings/branding/icon', { method: 'PUT', body });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { saved: true });
    const image = await fetch(origin + '/catalog/branding/icon'); assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(image.headers.get('cache-control'), 'no-store');
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'png');
    for (const kind of ['hero', 'about']) {
      const fallback = await fetch(origin + '/catalog/branding/' + kind, { redirect: 'manual' });
      assert.equal(fallback.status, 302); assert.equal(fallback.headers.get('cache-control'), 'no-store');
      assert.equal(fallback.headers.get('location'), kind === 'hero' ? '/storefront/hero-3d-objects.webp' : '/storefront/organizador-arco.webp');
      const upload = new FormData(); upload.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'scene.png');
      assert.equal((await fetch(origin + '/admin/settings/branding/' + kind, { method: 'PUT', body: upload })).status, 200);
      const scene = await fetch(origin + '/catalog/branding/' + kind);
      assert.equal(scene.headers.get('content-type'), 'image/webp'); assert.equal(scene.headers.get('x-content-type-options'), 'nosniff');
      assert.equal((await sharp(Buffer.from(await scene.arrayBuffer())).metadata()).format, 'webp');
    }
    assert.equal((await fetch(origin + '/catalog/branding/unknown')).status, 400);
  } finally { await app.close(); }
});
