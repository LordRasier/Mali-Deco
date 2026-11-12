import assert from 'node:assert/strict';
import test from 'node:test';
import { productPrice } from './product-price';

test('discounts activate only below the regular price, including a valid zero price', () => {
  for (const sale of [null, undefined, 10000, 12000]) assert.deepEqual(productPrice(10000, sale), { priceMinor: 10000 });
  assert.deepEqual(productPrice('10000', '7500'), { priceMinor: 7500, regularPriceMinor: 10000, discountPercent: '25' });
  assert.deepEqual(productPrice(10000, 0), { priceMinor: 0, regularPriceMinor: 10000, discountPercent: '100' });
  assert.deepEqual(productPrice(0, 0), { priceMinor: 0 });
});

test('percentage arithmetic is exact, never overstates the saving and handles small discounts', () => {
  assert.equal(productPrice(10000, 9999).discountPercent, '<1');
  assert.equal(productPrice(10000, 1).discountPercent, '99');
  assert.equal(productPrice(Number.MAX_SAFE_INTEGER, 1).discountPercent, '99');
  assert.equal(productPrice(300, 200).discountPercent, '33');
});

test('malformed persisted prices fail closed instead of falling back to a misleading price', () => {
  for (const value of ['', '1.5', '-1', '1e3', 'x', -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => productPrice(value, null));
    assert.throws(() => productPrice(1000, value));
  }
});
