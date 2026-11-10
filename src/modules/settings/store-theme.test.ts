import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource, QueryRunner } from 'typeorm';
import { StoreSettings } from './store-settings';
import { contrast, themeCss, themePalette } from './store-theme';
import { StoreAppearance1793360900000 } from '../../infrastructure/database/migrations/1793360900000-store-appearance';

test('persists an explicit primary color and preserves name-only compatibility', async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => { calls.push({ sql, args }); return [{ name: 'Mali', primaryColor: '#123abc' }]; } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  assert.deepEqual(await settings.set({ name: 'Mali', primaryColor: '#123ABC' }), { name: 'Mali', primaryColor: '#123abc' });
  assert.deepEqual(calls[0].args, ['Mali', '#123abc']);
  assert.match(calls[0].sql, /primary_color/);
  assert.equal((await settings.get()).primaryColor, '#123abc');
  await settings.set({ name: 'Renamed' });
  assert.doesNotMatch(calls.at(-1)!.sql.split('UPDATE')[1], /primary_color/);
  for (const color of ['red', '#abc', '#123456;}', '', null, 123, '#12345g']) await assert.rejects(settings.set({ name: 'Mali', primaryColor: color }), { status: 400 });
});

test('generated theme keeps the chosen fill, readable foregrounds and safe CSS', () => {
  for (const color of ['#ffffff', '#000000', '#ffff00', '#fa7290', '#073dcc', '#00ff00', '#777777']) {
    const palette = themePalette(color);
    assert.equal(palette.primary, color);
    assert.ok(contrast(palette.primary, palette.onPrimary) >= 4.5);
    assert.ok(contrast(palette.ink, '#ffffff') >= 4.5);
    assert.ok(contrast(palette.strong, '#ffffff') >= 4.5);
    assert.match(themeCss(color), /:root\{/);
    assert.match(themeCss(color), /--primary-ink:/);
  }
  assert.throws(() => themeCss('red;}body{display:none}'), { status: 400 });
});

test('pending schema updates keep existing public branding readable but do not acknowledge unsaved colors', async () => {
  const db = { isInitialized: true, query: async (sql: string) => {
    if (sql.includes('primary_color')) throw Object.assign(Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });
    return [{ name: 'Existing' }];
  } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  assert.deepEqual(await settings.get(), { name: 'Existing', primaryColor: '#073dcc' });
  await assert.rejects(settings.set({ name: 'Existing', primaryColor: '#112233' }), { status: 503 });
});

test('appearance migration is additive and rollback refuses to discard customizations', async () => {
  const calls: string[] = [];
  const q = { query: async (sql: string) => { calls.push(sql); return [{ total: 1 }]; } } as unknown as QueryRunner;
  const migration = new StoreAppearance1793360900000();
  await migration.up(q);
  assert.ok(calls.some(sql => /ADD.*primary_color/s.test(sql)));
  assert.ok(calls.some(sql => /hero.*about/.test(sql)));
  assert.ok(calls.every(sql => !/DROP TABLE|DELETE FROM/.test(sql)));
  await assert.rejects(migration.down(q), /custom/i);
});
