import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { adjustVariant } from './variant-quick-adjustment';
import { AdminCatalogController } from '../controllers/admin.controller';
import { CatalogAdmin } from './catalog-admin';

const input = { priceMinor: 15050, expectedPriceMinor: '10000', expectedCurrency: 'ARS', expectedSupplyMode: 'stock', stockQuantity: 8, expectedStockQuantity: 4 };
function fixture(row = { priceMinor: '10000', currency: 'ARS', supplyMode: 'stock' as string | null, stockQuantity: 4 }, parent = true, variant = true) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = { query: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    if (/FROM products/.test(sql)) return parent ? [{ id: 'p' }] : [];
    if (/SELECT.*FROM product_variants/s.test(sql)) return variant ? [row] : [];
    return { affectedRows: 1 };
  } };
  return { calls, db: { isInitialized: true, transaction: async (fn: (v: typeof tx) => unknown) => fn(tx) } as unknown as DataSource };
}
test('quick adjustment locks parent before variant and commits both values in one scoped update', async () => {
  const f = fixture(), controller = new AdminCatalogController(new CatalogAdmin(f.db));
  assert.deepEqual(await controller.adjustVariant('p', 'v', input), { id: 'v', productId: 'p', priceMinor: '15050', currency: 'ARS', supplyMode: 'stock', stockQuantity: 8 });
  assert.match(f.calls[0].sql, /FROM products.*archived_at IS NULL FOR UPDATE/);
  assert.match(f.calls[1].sql, /id = \? AND product_id = \? AND archived_at IS NULL FOR UPDATE/);
  assert.match(f.calls[2].sql, /SET price_minor = \?, stock_quantity = \? WHERE id = \? AND product_id = \?/);
  assert.deepEqual(f.calls[2].values, ['15050', 8, 'v', 'p']);
});
test('concurrent stock, price, currency and supply changes reject the entire adjustment', async () => {
  for (const changed of [{ stockQuantity: 3 }, { priceMinor: '11000' }, { currency: 'USD' }, { supplyMode: 'made_to_order' }]) {
    const f = fixture({ priceMinor: '10000', currency: 'ARS', supplyMode: 'stock', stockQuantity: 4, ...changed });
    await assert.rejects(adjustVariant(f.db, 'p', 'v', input), { status: 409 });
    assert.equal(f.calls.some(call => call.sql.startsWith('UPDATE')), false);
  }
});
test('price-only adjustments never overwrite inventory, including a purchase since the list was read', async () => {
  const f = fixture({ priceMinor: '10000', currency: 'ARS', supplyMode: 'stock', stockQuantity: 3 });
  const price = { priceMinor: input.priceMinor, expectedPriceMinor: input.expectedPriceMinor, expectedCurrency: input.expectedCurrency, expectedSupplyMode: input.expectedSupplyMode };
  const result = await adjustVariant(f.db, 'p', 'v', price);
  assert.equal(result.stockQuantity, 3); assert.doesNotMatch(f.calls[2].sql, /stock_quantity/);
  const demand = fixture({ priceMinor: '10000', currency: 'ARS', supplyMode: 'made_to_order', stockQuantity: 0 });
  await adjustVariant(demand.db, 'p', 'v', { ...price, expectedSupplyMode: 'made_to_order' });
  assert.doesNotMatch(demand.calls[2].sql, /stock_quantity/);
});
test('invalid, partial, unbounded and unrelated fields cannot reach the database', async () => {
  for (const value of [null, [], {}, { ...input, stockQuantity: -1 }, { ...input, stockQuantity: 1.5 }, { ...input, stockQuantity: 1000001 },
    { ...input, priceMinor: Number.MAX_SAFE_INTEGER + 1 }, { ...input, priceMinor: '100' }, { ...input, expectedPriceMinor: 10000 },
    { ...input, expectedSupplyMode: undefined }, { ...input, expectedCurrency: 'ars' }, { ...input, expectedStockQuantity: undefined }, { ...input, name: 'Overwrite' }]) {
    const f = fixture(); await assert.rejects(adjustVariant(f.db, 'p', 'v', value), { status: 400 }); assert.deepEqual(f.calls, []);
  }
});
test('missing or archived parents/variants are not editable, and unchanged values issue no update', async () => {
  for (const f of [fixture(undefined, false), fixture(undefined, true, false)]) await assert.rejects(adjustVariant(f.db, 'p', 'v', input), { status: 404 });
  const f = fixture(); await adjustVariant(f.db, 'p', 'v', { ...input, priceMinor: 10000, stockQuantity: 4 }); assert.equal(f.calls.length, 2);
});
