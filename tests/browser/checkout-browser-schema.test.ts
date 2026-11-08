import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { assertCheckoutSchema } from './checkout-browser-schema';
import { ProductImages1793360700000 } from '../../src/infrastructure/database/migrations/1793360700000-product-images';
import { StoreBrandAssets1793360800000 } from '../../src/infrastructure/database/migrations/1793360800000-store-brand-assets';

const checkoutTables = [
  'migrations', 'products', 'product_variants', 'store_settings',
  'admin_users', 'admin_sessions', 'login_attempt_windows',
  'categories', 'materials', 'colors',
  'checkout_sessions', 'checkout_quotes', 'checkout_orders',
];
const rowsFor = (names: string[]) => names.map(name => ({ Tables_in_store_integration_test: name, Table_type: 'BASE TABLE' }));

async function migratedSchema() {
  const tables = [...checkoutTables];
  // Capture DDL emitted by the real media migration; never connect to a database.
  const runner = { query: async (sql: string) => {
    const created = /^CREATE TABLE (\w+)\s*\(/.exec(sql);
    if (created) tables.push(created[1]);
    return [];
  } } as unknown as QueryRunner;
  await new ProductImages1793360700000().up(runner);
  await new StoreBrandAssets1793360800000().up(runner);
  return rowsFor(tables);
}

test('browser harness rejects an empty post-migration schema', () => {
  assert.throws(() => assertCheckoutSchema([]), /Unexpected objects after migration/);
});

test('browser harness accepts the complete checkout schema including the media migration', async () => {
  const rows = await migratedSchema();
  assert.equal(rows.length, 17);
  assert.doesNotThrow(() => assertCheckoutSchema(rows));
});

test('browser harness rejects a schema missing a required media table', async () => {
  const rows = await migratedSchema();
  assert.throws(() => assertCheckoutSchema(rows.filter(row => row.Tables_in_store_integration_test !== 'product_images')), /Unexpected objects after migration/);
});

test('browser harness rejects unexpected objects even when the table count matches', async () => {
  const rows = await migratedSchema();
  rows[0] = { Tables_in_store_integration_test: 'unrelated_table', Table_type: 'BASE TABLE' };
  assert.throws(() => assertCheckoutSchema(rows), /Unexpected/);
});

test('browser harness rejects views and extra tables', async () => {
  const rows = await migratedSchema();
  assert.throws(() => assertCheckoutSchema([...rows, ...rowsFor(['unrelated_table'])]), /Unexpected objects/);
  rows[0].Table_type = 'VIEW';
  assert.throws(() => assertCheckoutSchema(rows), /Unexpected/);
});
