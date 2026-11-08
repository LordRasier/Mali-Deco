import assert from 'node:assert/strict';
import test from 'node:test';
import { quickAdjustment, quickVariants, adjustmentReceipt, type QuickVariant } from '../../src/presentation/admin/client/browser/products/product-quick-edit-data';

const variant: QuickVariant = { id: 'v', productId: 'p', name: 'Azul', sku: 'AZ', priceMinor: '10000', currency: 'ARS', supplyMode: 'stock', stockQuantity: 4, archivedAt: null };
test('quick edits preserve exact money and omit unchanged inventory from the write', () => {
  assert.equal(quickAdjustment(variant, '100,00', '4'), null);
  assert.deepEqual(quickAdjustment(variant, '150,25', '4'), { priceMinor: 15025, expectedPriceMinor: '10000', expectedCurrency: 'ARS', expectedSupplyMode: 'stock' });
  const both = quickAdjustment(variant, '150.25', '8')!;
  assert.equal(both.stockQuantity, 8); assert.equal(both.expectedStockQuantity, 4);
  assert.equal(quickAdjustment({ ...variant, supplyMode: 'made_to_order' }, '120', '')?.stockQuantity, undefined);
  for (const [price, stock] of [['1.234', '4'], ['NaN', '4'], ['1', '-1'], ['1', '1.2'], ['1', '1000001']]) assert.throws(() => quickAdjustment(variant, price, stock));
});
test('bounded quick reads reject wrong product/page, duplicates and malformed values', () => {
  const page = { id: 'p', archivedAt: null, variants: [variant, { ...variant, id: 'archived', archivedAt: '2026-01-01' }], page: 1, limit: 24, total: 2 };
  assert.deepEqual(quickVariants(page, 'p', 1), { variants: [variant], total: 2 });
  for (const bad of [{ ...page, id: 'other' }, { ...page, page: 2 }, { ...page, archivedAt: '2026-01-01' }, { ...page, variants: [variant, variant] },
    { ...page, variants: [{ ...variant, stockQuantity: -1 }] }, { ...page, variants: [{ ...variant, supplyMode: 'unlimited' }] }, { ...page, variants: Array(25).fill(variant) }]) assert.throws(() => quickVariants(bad, 'p', 1));
});
test('only a matching acknowledgement can clear a draft; price-only receipts accept newer inventory', () => {
  const body = quickAdjustment(variant, '120', '8')!;
  const receipt = { id: 'v', productId: 'p', priceMinor: '12000', stockQuantity: 8, currency: 'ARS', supplyMode: 'stock' };
  assert.equal(adjustmentReceipt(receipt, variant, body).stockQuantity, 8);
  for (const bad of [undefined, {}, { ...receipt, id: 'other' }, { ...receipt, priceMinor: '12100' }, { ...receipt, stockQuantity: 7 }]) assert.throws(() => adjustmentReceipt(bad, variant, body));
  assert.equal(adjustmentReceipt({ ...receipt, stockQuantity: 3 }, variant, quickAdjustment(variant, '120', '4')!).stockQuantity, 3);
});
