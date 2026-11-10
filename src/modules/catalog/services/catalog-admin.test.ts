import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CatalogAdmin } from './catalog-admin';
import { DataSource } from 'typeorm';
import { AdminCatalogController } from '../controllers/admin.controller';

test('admin rejects unknown supply policies before reaching persistence', async () => {
  const admin = new CatalogAdmin();
  const input = { sku: 'SKU', name: 'Rojo', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' as const };
  await assert.rejects(admin.createVariant('product', { ...input, supplyMode: 'unlimited' as 'stock' }), { status: 400 });
  await assert.rejects(admin.createVariant('product', input), { status: 503 });
});

test('duplicate slug is reported as a conflict and unknown body fields are rejected', async () => {
  const repo = { create: (value: unknown) => value, save: async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); } };
  const manager = { getRepository: () => repo, query: async () => [] };
  const db = { isInitialized: true, transaction: async (run: (m: typeof manager) => unknown) => run(manager) } as unknown as DataSource;
  const admin = new CatalogAdmin(db);
  const input = { name: 'Pieza', slug: 'pieza', description: '', status: 'draft' as const };
  await assert.rejects(admin.createProduct(input), { status: 409 });
  const controller = new AdminCatalogController(admin);
  assert.throws(() => controller.create({ ...input, archivedAt: 'injected' }), { status: 400 });
});

test('admin does not accept invalid product or silently persist without a database', async () => {
  const admin = new CatalogAdmin();
  const input = { name: 'Pieza', slug: 'pieza', description: '', status: 'draft' as const };
  await assert.rejects(admin.createProduct({ ...input, slug: 'Invalid slug' }), { status: 400 });
  await assert.rejects(admin.createProduct(input), { status: 503 });
});

test('concurrent archival cannot be overwritten by product or variant edits', async () => {
  const updates: Array<{ criteria: Record<string, unknown>; values: Record<string, unknown> }> = [];
  const productRepo = {
    findOne: async () => ({ id: 'p', slug: 'edit', status: 'draft' }),
    findOneBy: async () => ({ id: 'p' }),
    update: async (criteria: Record<string, unknown>, values: Record<string, unknown>) => { updates.push({ criteria, values }); return { affected: 0 }; },
  };
  const variantRepo = { update: productRepo.update };
  const repos = [productRepo, productRepo, variantRepo];
  const manager = { getRepository: () => repos.shift() };
  const db = { isInitialized: true, ...manager, transaction: async (run: (m: typeof manager) => unknown) => run(manager) } as unknown as DataSource;
  const admin = new CatalogAdmin(db);
  await assert.rejects(admin.updateProduct('p', { name: 'Edit', slug: 'edit', description: '', status: 'draft' }), { status: 404 });
  await assert.rejects(admin.updateVariant('p', 'v', { sku: 'SKU', name: 'Edit', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' }), { status: 404 });
  assert.equal(updates.length, 2);
  for (const update of updates) {
    assert.equal((update.criteria.archivedAt as { type: string }).type, 'isNull');
    assert.equal('archivedAt' in update.values, false);
  }
});
