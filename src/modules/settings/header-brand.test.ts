import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource, QueryRunner } from 'typeorm';
import { StoreSettings } from './store-settings';
import { HeaderBrandMode1793362900000 } from '../../infrastructure/database/migrations/1793362900000-header-brand-mode';
import { storeInformation, StoreInformationReader } from '../../presentation/information/store-information';
import { configuredInformation, contentModel } from '../../presentation/information/content-model';
import { defaultContentConfig } from './content-config';
import { createViewEngine } from '../../presentation/view-engine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('brand modes round trip, reject unknown values and preserve omitted settings', async () => {
  let headerBrandMode = 'logo_text'; const writes: string[] = [];
  const db = { isInitialized: true, async query(sql: string, args: unknown[] = []) {
    if (sql.startsWith('SELECT')) return [{ name: 'Mali', primaryColor: '#112233', headerBrandMode }];
    writes.push(sql); if (sql.includes('header_brand_mode')) headerBrandMode = String(args[1]); return {};
  } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  for (const mode of ['logo', 'text', 'logo_text']) {
    assert.deepEqual(await settings.set({ name: 'Mali', headerBrandMode: mode }), { name: 'Mali', headerBrandMode: mode });
    assert.equal((await settings.get()).headerBrandMode, mode);
  }
  await settings.set({ name: 'Other' }); assert.doesNotMatch(writes.at(-1)!, /header_brand_mode/);
  const before = writes.length;
  for (const value of ['', null, {}, 'both', 'LOGO', 'logo;DROP TABLE store_settings']) await assert.rejects(settings.set({ name: 'Mali', headerBrandMode: value }), { status: 400 });
  assert.equal(writes.length, before);
});

test('before migration other settings remain usable and a mode save cannot claim success', async () => {
  const db = { isInitialized: true, async query(sql: string) {
    if (sql.includes('header_brand_mode')) throw Object.assign(Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });
    return [{ name: 'Mali', primaryColor: '#112233', whatsappNumber: '', instagramUsername: '' }];
  } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  assert.equal(Object.hasOwn(await settings.get(), 'headerBrandMode'), false);
  assert.equal((await settings.get()).whatsappNumber, '');
  await settings.set({ name: 'Mali', primaryColor: '#112233' });
  await assert.rejects(settings.set({ name: 'Mali', headerBrandMode: 'logo' }), { status: 503 });
});

test('saved modes reach the storefront, tracking and visual preview while keeping the brand accessible', async () => {
  const engine = createViewEngine({ site_footer: '' }), config = defaultContentConfig();
  for (const mode of ['logo', 'logo_text', 'text'] as const) {
    const reader = new StoreInformationReader(storeInformation({}), { get: async () => ({ name: 'Mali', primaryColor: '#112233', headerBrandMode: mode }) });
    const info = configuredInformation(await reader.get(), config);
    for (const preview of [false, true]) {
      const model = { ...contentModel(config, info, preview), layout: false, brand: 'Mali <script>', routes: { home: '/', catalog: '/catalogo' } };
      for (const file of ['shell/views/header.hbs', 'tracking/views/tracking.hbs']) {
        const html = await new Promise<string>((resolve, reject) => engine.__express(join(__dirname, '../../presentation', file), model, (error, value) => error ? reject(error) : resolve(value!)));
        assert.ok(html.includes(`data-brand-display="${mode}"`)); assert.match(html, /aria-label="Mali &lt;script&gt;"/);
        assert.equal(/<img data-brand-logo/.test(html), mode !== 'text');
        assert.equal(/<span data-brand-name hidden/.test(html), mode === 'logo');
      }
    }
  }
});

test('migration preserves the current combined brand and refuses to drop a selected customization', async () => {
  const sql: string[] = [];
  const runner = { async query(query: string) { sql.push(query); return [{ total: 1 }]; } } as unknown as QueryRunner;
  const migration = new HeaderBrandMode1793362900000(); await migration.up(runner);
  assert.match(sql[0], /ENUM\('logo', 'logo_text', 'text'\).*DEFAULT 'logo_text'/);
  assert.doesNotMatch(sql[0], /DELETE|DROP/); await assert.rejects(migration.down(runner), /customized/);
  const source = readFileSync(join(__dirname, '../../infrastructure/database/header-brand-data-source.ts'), 'utf8');
  assert.match(source, /migrations: \[HeaderBrandMode1793362900000\]/);
});
