import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { saveVariantPricing, validateInitialPricing } from './variant-pricing';

const initial = { priceMinor: '13000', costMinor: '10000' as string | null, currency: 'ARS', supplyMode: 'stock', stockQuantity: 4 };
const input = { priceMinor: 15000, costMinor: 11000, supplyMode: 'stock', expectedPriceMinor: '13000', expectedCostMinor: '10000', expectedCurrency: 'ARS', expectedSupplyMode: 'stock' };
function fixture(row = initial, parent = true, variant = true) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = { query: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    if (/FROM products/.test(sql)) return parent ? [{ id: 'p' }] : [];
    if (/SELECT.*FROM product_variants/s.test(sql)) return variant ? [row] : [];
    return { affectedRows: 1 };
  } };
  return { calls, db: { isInitialized: true, transaction: async (fn: (v: typeof tx) => unknown) => fn(tx) } as unknown as DataSource };
}
test('cost/price/inventory commit atomically, and switching to unlimited preserves the existing quantity', async () => {
  const f = fixture();
  const receipt = await saveVariantPricing(f.db, 'p', 'v', { ...input, supplyMode: 'made_to_order', stockQuantity: 4, expectedStockQuantity: 4 });
  assert.equal(receipt.costMinor, '11000'); assert.equal(receipt.priceMinor, '15000'); assert.equal(receipt.supplyMode, 'made_to_order'); assert.equal(receipt.stockQuantity, 4);
  assert.match(f.calls[0].sql, /products.*FOR UPDATE/);
  assert.match(f.calls[1].sql, /product_id = \?.*FOR UPDATE/);
  assert.equal(f.calls.filter(c => c.sql.startsWith('UPDATE')).length, 1);
  assert.deepEqual(f.calls[2].values, ['15000', '11000', 'made_to_order', 'v', 'p']);
});
test('price-only saves keep a purchase decrement, while explicit stock or mode changes reject stale inventory', async () => {
  const f = fixture({ ...initial, stockQuantity: 3 });
  assert.equal((await saveVariantPricing(f.db, 'p', 'v', input)).stockQuantity, 3);
  assert.doesNotMatch(f.calls[2].sql, /stock_quantity/);
  for (const supplyMode of ['stock', 'made_to_order']) {
    const stale = fixture({ ...initial, stockQuantity: 3 });
    await assert.rejects(saveVariantPricing(stale.db, 'p', 'v', { ...input, supplyMode, stockQuantity: 8, expectedStockQuantity: 4 }), { status: 409 });
    assert.equal(stale.calls.length, 2);
  }
});
test('concurrent cost/price/mode changes and archived records cannot be overwritten', async () => {
  for (const changed of [{ costMinor: null }, { priceMinor: '12000' }, { currency: 'USD' }, { supplyMode: 'made_to_order' }]) {
    await assert.rejects(saveVariantPricing(fixture({ ...initial, ...changed }).db, 'p', 'v', input), { status: 409 });
  }
  for (const f of [fixture(initial, false), fixture(initial, true, false)]) await assert.rejects(saveVariantPricing(f.db, 'p', 'v', input), { status: 404 });
});
test('blank cost is nullable; malformed, partial or unsafe values never reach the database', async () => {
  const f = fixture(); assert.equal((await saveVariantPricing(f.db, 'p', 'v', { ...input, costMinor: null })).costMinor, null);
  for (const bad of [null, {}, { ...input, costMinor: '' }, { ...input, costMinor: -1 }, { ...input, priceMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, expectedCostMinor: undefined }, { ...input, supplyMode: 'made_to_order' }, { ...input, stockQuantity: 10 },
    { ...input, stockQuantity: 1.5, expectedStockQuantity: 4 }, { ...input, unrelated: true }]) {
    const f = fixture(); await assert.rejects(saveVariantPricing(f.db, 'p', 'v', bad), { status: 400 }); assert.equal(f.calls.length, 0);
  }
  for (const bad of [{ costMinor: -1 }, { stockQuantity: 1.2 }, { stockQuantity: 1000001 }]) assert.throws(() => validateInitialPricing(bad), { status: 400 });
});
