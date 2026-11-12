import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { CatalogAdmin } from './catalog-admin';
import { ProductSchema, VariantSchema } from '../models/catalog.entities';
import { AdminCatalogController } from '../controllers/admin.controller';

const product = { name: 'Florero', slug: 'florero', description: '', status: 'draft' as const };
const price = { priceMinor: 125000, currency: 'ARS', supplyMode: 'made_to_order' as const };

test('creates the product and its standard priced variant in one transaction', async () => {
  const writes: Array<{ kind: string; value: Record<string, unknown> }> = [];
  let transactions = 0;
  const manager = { query: async () => [], getRepository: (schema: unknown) => ({
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => { writes.push({ kind: schema === ProductSchema ? 'product' : schema === VariantSchema ? 'variant' : 'unknown', value }); return value; },
  }) };
  const db = { isInitialized: true, transaction: async (work: (m: typeof manager) => Promise<unknown>) => { transactions++; return work(manager); } } as unknown as DataSource;
  const result = await new CatalogAdmin(db).createProductWithPrice({ ...product, featured: true }, { ...price, salePriceMinor: 100000, costMinor: 100000, stockQuantity: 5, supplyMode: 'stock' });
  assert.equal(transactions, 1); assert.deepEqual(writes.map(w => w.kind), ['product', 'variant']);
  assert.equal(writes[1].value.productId, result.id); assert.equal(writes[1].value.priceMinor, '125000');
  assert.equal(writes[1].value.costMinor, '100000'); assert.equal(writes[1].value.stockQuantity, 5);
  assert.equal(writes[0].value.featured, true); assert.equal(writes[1].value.salePriceMinor, '100000');
});

test('rejects invalid initial prices before accessing persistence', async () => {
  await assert.rejects(new CatalogAdmin().createProductWithPrice(product, { ...price, priceMinor: -1 }), { status: 400 });
  await assert.rejects(new CatalogAdmin().createProductWithPrice(product, { ...price, supplyMode: 'other' as 'stock' }), { status: 400 });
  const controller = new AdminCatalogController(new CatalogAdmin());
  assert.throws(() => controller.createWithPrice({ product, price: { ...price, sku: 'injected' } }), { status: 400 });
  assert.throws(() => controller.createWithPrice({ product: { ...product, archivedAt: 'injected' }, price }), { status: 400 });
});

test('a variant failure aborts the transaction without committing the product', async () => {
  const committed: unknown[] = [];
  const db = { isInitialized: true, transaction: async (work: (m: unknown) => Promise<unknown>) => {
    const staged: unknown[] = [];
    const manager = { query: async () => [], getRepository: (schema: unknown) => ({ create: (v: unknown) => v, save: async (v: unknown) => {
      if (schema === VariantSchema) throw new Error('variant failure'); staged.push(v); return v;
    } }) };
    const result = await work(manager); committed.push(...staged); return result;
  } } as unknown as DataSource;
  await assert.rejects(new CatalogAdmin(db).createProductWithPrice(product, price), /variant failure/);
  assert.deepEqual(committed, []);
});
