import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource, QueryRunner } from 'typeorm';
import { VariantInventory1793361000000 } from '../../../infrastructure/database/migrations/1793361000000-variant-inventory';
import { changeVariantStock } from './variant-stock';
import { validateProduct } from '../validation/catalog-validation';
import { CatalogAdmin } from './catalog-admin';
import { AdminCatalogController } from '../controllers/admin.controller';
import { ProductSchema, VariantSchema } from '../models/catalog.entities';

test('admin persists warning pairs without clearing omitted settings and exposes separate inventory action', async () => {
  const updates: Record<string, unknown>[] = [];
  const repo = { update: async (_: unknown, v: Record<string, unknown>) => { updates.push(v); return { affected: 1 }; }, findOne: async () => ({ id: 'p', ...product }), findOneBy: async () => ({ id: 'p' }) };
  const manager = { getRepository: () => repo };
  const admin = new CatalogAdmin({ isInitialized: true, ...manager, transaction: async (run: (m: typeof manager) => unknown) => run(manager) } as unknown as DataSource);
  await admin.updateProduct('p', { ...product, bulkWarningThreshold: 3, bulkWarningMessage: '  Large order  ' });
  assert.equal(updates[0].bulkWarningThreshold, 3); assert.equal(updates[0].bulkWarningMessage, 'Large order');
  await admin.updateProduct('p', product); assert.equal('bulkWarningThreshold' in updates[1], false);
  await admin.updateProduct('p', { ...product, bulkWarningThreshold: null, bulkWarningMessage: null });
  assert.equal(updates[2].bulkWarningMessage, null);
  assert.ok(ProductSchema.options.columns.bulkWarningThreshold); assert.ok(VariantSchema.options.columns.stockQuantity);
  const f = fixture(); const controller = new AdminCatalogController(new CatalogAdmin(f.db));
  assert.equal((await controller.updateVariantStock('p', 'v', { stockQuantity: 3, expectedStockQuantity: 4 })).stockQuantity, 3);
  assert.throws(() => controller.updateVariant('p', 'v', { stockQuantity: 100 }), { status: 400 });
});

const product = { name: 'Piece', slug: 'piece', description: '', status: 'draft' as const };
test('inventory migration has bounded defaults and refuses rollback with populated settings', async () => {
  const statements: string[] = [];
  const q = { query: async (sql: string) => { statements.push(sql); return [{ total: 1 }]; } } as unknown as QueryRunner;
  const migration = new VariantInventory1793361000000(); await migration.up(q);
  assert.match(statements.join('\n'), /stock_quantity.*DEFAULT 0/s);
  assert.match(statements.join('\n'), /bulk_warning_threshold/); assert.match(statements.join('\n'), /CHECK/);
  await assert.rejects(migration.down(q), /inventory or warnings/);
  assert.equal(statements.some(sql => /DROP COLUMN/.test(sql)), false);
});

test('bulk warning is an optional bounded atomic pair', () => {
  validateProduct(product);
  for (const bulkWarningThreshold of [1, 1000]) validateProduct({ ...product, bulkWarningThreshold, bulkWarningMessage: 'Large orders may take longer.' });
  validateProduct({ ...product, bulkWarningThreshold: null, bulkWarningMessage: null });
  for (const fields of [{ bulkWarningThreshold: 0, bulkWarningMessage: 'x' }, { bulkWarningThreshold: 1001, bulkWarningMessage: 'x' }, { bulkWarningThreshold: 1.5, bulkWarningMessage: 'x' }, { bulkWarningThreshold: 1 }, { bulkWarningMessage: 'x' }, { bulkWarningThreshold: 1, bulkWarningMessage: ' ' }, { bulkWarningThreshold: 1, bulkWarningMessage: 'x'.repeat(301) }]) assert.throws(() => validateProduct({ ...product, ...fields }), { status: 400 });
});

function fixture(stock = 4, mode = 'stock') {
  let current = stock; const calls: string[] = [];
  const tx = { query: async (sql: string, values: unknown[]) => {
    calls.push(sql);
    if (/FROM products/.test(sql)) return [{ id: 'p' }];
    if (/SELECT.*FROM product_variants/s.test(sql)) return [{ id: 'v', supplyMode: mode, stockQuantity: current }];
    if (/UPDATE product_variants/.test(sql)) { if (values.at(-1) !== current) return { affectedRows: 0 }; current = Number(values[0]); return { affectedRows: 1 }; }
    throw Error(sql);
  } };
  const db = { isInitialized: true, transaction: async (fn: (v: typeof tx) => unknown) => fn(tx) } as unknown as DataSource;
  return { db, calls, stock: () => current };
}

test('stock compare-and-set protects stale edits and locks parent before variant', async () => {
  const f = fixture(); assert.deepEqual(await changeVariantStock(f.db, 'p', 'v', { stockQuantity: 8, expectedStockQuantity: 4 }), { id: 'v', productId: 'p', stockQuantity: 8 });
  assert.equal(f.stock(), 8); assert.match(f.calls[0], /FROM products.*FOR UPDATE/s); assert.match(f.calls[1], /FROM product_variants.*FOR UPDATE/s);
  await assert.rejects(changeVariantStock(f.db, 'p', 'v', { stockQuantity: 7, expectedStockQuantity: 4 }), { status: 409 });
  assert.equal(f.stock(), 8);
});

test('invalid stock input and made-to-order inventory edits cannot change quantities', async () => {
  for (const stockQuantity of [-1, 0.1, '4', null, 1000001]) {
    const f = fixture(); await assert.rejects(changeVariantStock(f.db, 'p', 'v', { stockQuantity, expectedStockQuantity: 4 }), { status: 400 }); assert.deepEqual(f.calls, []);
  }
  const f = fixture(4, 'made_to_order'); await assert.rejects(changeVariantStock(f.db, 'p', 'v', { stockQuantity: 2, expectedStockQuantity: 4 }), { status: 409 }); assert.equal(f.stock(), 4);
});
