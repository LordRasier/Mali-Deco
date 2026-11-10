import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { AdminCatalogController } from '../controllers/admin.controller';
import { ProductSchema } from '../models/catalog.entities';
import { CatalogAdmin } from './catalog-admin';

function fixture() {
  const row = { id: 'v', productId: 'p', archivedAt: null as Date | null, priceMinor: '199', currency: 'USD', supplyMode: 'stock',
    name: 'Old name', sku: 'OLD', colorId: 'old-color', materialId: 'old-material' };
  const parent = { id: 'p', archivedAt: null as Date | null };
  type Criteria = { id: string; productId: string; archivedAt: { type: string } };
  const matches = (q: Criteria) => q.id === row.id && q.productId === row.productId && q.archivedAt.type === 'isNull' && !row.archivedAt;
  const repo = {
    update: async (q: Criteria, fields: Partial<typeof row>) => {
      if (!matches(q)) return { affected: 0 };
      Object.assign(row, fields); return { affected: 1 };
    },
    findOneBy: async (q: Criteria) => matches(q) ? { ...row } : null,
  };
  const manager = { getRepository: (schema: unknown) => schema !== ProductSchema ? repo : {
    findOne: async ({ where, lock }: { where: Criteria; lock: { mode: string } }) => {
      assert.equal(lock.mode, 'pessimistic_write');
      return where.id === parent.id && where.archivedAt.type === 'isNull' && !parent.archivedAt ? parent : null;
    },
  } };
  const db = { isInitialized: true, transaction: async (work: (m: typeof manager) => unknown) => work(manager) };
  return { row, parent, controller: new AdminCatalogController(new CatalogAdmin(db as unknown as DataSource)) };
}
const price = { priceMinor: 0, currency: 'ARS', supplyMode: 'made_to_order' };
test('a previously opened price form cannot overwrite later SKU, name, material or color edits', async () => {
  const { row, controller } = fixture();
  const concurrent = { name: 'Concurrent name', sku: 'NEW', materialId: 'new-material', colorId: 'new-color' };
  Object.assign(row, concurrent);
  const result = await controller.updateVariantPrice('p', 'v', price);
  const expected = { ...concurrent, ...price, priceMinor: '0', id: 'v', productId: 'p', archivedAt: null };
  assert.deepEqual(result, expected); assert.deepEqual(row, expected);
  for (const key of ['sku', 'name', 'colorId', 'materialId', 'archivedAt']) {
    assert.throws(() => controller.updateVariantPrice('p', 'v', { ...price, [key]: 'stale' }), { status: 400 });
  }
});
test('price updates require valid money, currency and supply and apply only to an unarchived target and parent', async () => {
  const { controller, row, parent } = fixture();
  for (const input of [{}, { ...price, priceMinor: -1 }, { ...price, priceMinor: '0' }, { ...price, priceMinor: 0.5 },
    { ...price, currency: 'ars' }, { ...price, currency: null }, { ...price, supplyMode: null }, { ...price, supplyMode: 'retail' }]) {
    await assert.rejects(controller.updateVariantPrice('p', 'v', input), { status: 400 });
  }
  await assert.rejects(controller.updateVariantPrice('p', 'wrong', price), { status: 404 });
  await assert.rejects(controller.updateVariantPrice('other', 'v', price), { status: 404 });
  row.archivedAt = new Date(); await assert.rejects(controller.updateVariantPrice('p', 'v', price), { status: 404 });
  row.archivedAt = null; parent.archivedAt = new Date();
  await assert.rejects(controller.updateVariantPrice('p', 'v', price), { status: 404 });
  assert.equal(row.priceMinor, '199');
});
