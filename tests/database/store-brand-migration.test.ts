import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { StoreBrandAssets1793360800000 } from '../../src/infrastructure/database/migrations/1793360800000-store-brand-assets';

test('branding migration creates a bounded-kind table and refuses to discard saved images', async () => {
  const calls: string[] = [];
  const q = { query: async (sql: string) => { calls.push(sql); return sql.startsWith('SELECT COUNT') ? [{ total: 1 }] : []; } } as unknown as QueryRunner;
  const migration = new StoreBrandAssets1793360800000();
  await migration.up(q); assert.match(calls[0], /CREATE TABLE store_brand_assets/); assert.match(calls[0], /'logo', 'icon'/);
  await assert.rejects(migration.down(q), /while assets exist/); assert.equal(calls.length, 2);
});
