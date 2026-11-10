import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { defaultSiteConfig, parseSiteConfig } from './site-config';
import { SiteSettings, SiteSettingsController } from './site-settings';
import { OwnerGuard } from '../identity/http/owner.guard';

test('site settings accept canonical HTTPS and Google IDs, never scripts or unknown settings', () => {
  const defaults = defaultSiteConfig(); assert.equal(defaults.analyticsMode, 'off');
  const valid = { ...defaults, publicSiteUrl: 'https://mali-store.com.ar', analyticsMode: 'ga4', ga4Id: ' g-test12345 ' };
  assert.equal(parseSiteConfig(valid).ga4Id, 'G-TEST12345');
  assert.equal(parseSiteConfig({ ...defaults, analyticsMode: 'gtm', gtmId: 'GTM-TEST123' }).analyticsMode, 'gtm');
  for (const changed of [{ analyticsMode: 'both' }, { analyticsMode: 'ga4' }, { analyticsMode: 'gtm' }, { ga4Id: '<script>alert(1)</script>' }, { gtmId: 'https://evil.example' }, { publicSiteUrl: 'http://shop.example' }, { publicSiteUrl: 'https://shop.example/' }, { publicSiteUrl: 'https://shop.example/path' }, { homeTitle: 'a\u0000b' }, { homeDescription: '<img>' }, { injected: 'secret' }]) assert.throws(() => parseSiteConfig({ ...defaults, ...changed }));
});

test('unconfigured or unavailable settings are off; owner-only writes require persistence', async () => {
  const settings = new SiteSettings(); assert.equal((await settings.get()).available, false); assert.equal((await settings.publicSettings()).analyticsMode, 'off');
  await assert.rejects(settings.set({ settings: defaultSiteConfig(), revision: 0 }), { status: 503 });
  assert.deepEqual(Reflect.getMetadata('__guards__', SiteSettingsController), [OwnerGuard]);
  const offline = new SiteSettings({ isInitialized: true, query: async () => { throw Error('private database error'); } } as unknown as DataSource);
  assert.equal((await offline.publicSettings()).analyticsMode, 'off');
  await assert.rejects(offline.get());
});

test('site settings use optimistic revisions and preserve the confirmed data after stale writes', async () => {
  let config = JSON.stringify(defaultSiteConfig()), revision = 0;
  const manager = { query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) return { affectedRows: 0 };
    if (args[1] !== revision) return { affectedRows: 0 };
    config = String(args[0]); revision++; return { affectedRows: 1 };
  } };
  const db = { isInitialized: true, query: async () => [{ config, revision }], transaction: async (work: (m: typeof manager) => unknown) => work(manager) } as unknown as DataSource;
  const store = new SiteSettings(db), next = { ...defaultSiteConfig(), analyticsMode: 'ga4' as const, ga4Id: 'G-TEST12345' };
  assert.deepEqual(await store.set({ settings: next, revision: 0 }), { settings: next, revision: 1, available: true });
  await assert.rejects(store.set({ settings: defaultSiteConfig(), revision: 0 }), { status: 409 });
  assert.equal((await store.get()).settings.ga4Id, 'G-TEST12345');
  await assert.rejects(store.set({ settings: next, revision: -1 }), { status: 400 });
  await assert.rejects(store.set({ settings: next, revision: 1, unexpected: true }), { status: 400 });
});
