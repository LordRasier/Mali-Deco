import test from 'node:test';
import assert from 'node:assert/strict';
import { addToCart, changeQuantity, resolveCart, formatPrice, reconcileCart } from '../src/lib/cart.ts';

test('adding the same variant increments; other colors remain distinct', () => {
  let cart = addToCart([], 'vase', 'blue');
  cart = addToCart(cart, 'vase', 'blue');
  cart = addToCart(cart, 'vase', 'coral');
  assert.deepEqual(cart, [{ productId: 'vase', variantId: 'blue', quantity: 2 }, { productId: 'vase', variantId: 'coral', quantity: 1 }]);
});
test('changing quantities updates only the matching variant and zero removes it', () => {
  const cart = [{ productId: 'vase', variantId: 'blue', quantity: 2 }, { productId: 'vase', variantId: 'coral', quantity: 1 }];
  assert.deepEqual(changeQuantity(cart, 'vase', 'blue', 0), [cart[1]]);
  assert.equal(changeQuantity(cart, 'vase', 'coral', 3)[1].quantity, 3);
});
test('stale product or variant IDs cannot affect displayed cart totals', () => {
  const product = { id: 'vase', variants: [{ id: 'blue', priceMinor: 10, currency: 'ARS' }] };
  const lines = [{ productId: 'vase', variantId: 'gone', quantity: 10 }, { productId: 'vase', variantId: 'blue', quantity: 2 }];
  const resolved = resolveCart(lines, [product]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].variant.priceMinor * resolved[0].quantity, 20);
});

test('formats minor units exactly for different currency scales and large subtotals', () => {
  assert.match(formatPrice(12345, 'ARS'), /123,45/);
  assert.match(formatPrice(12345, 'JPY'), /12.345/);
  assert.match(formatPrice(900719925474099100n, 'ARS'), /9.007.199.254.740.991,00/);
});

test('restored cart merges duplicate pairs and prunes missing products and variants', () => {
  const products = [{ id: 'vase', variants: [{ id: 'blue' }] }];
  const restored = reconcileCart([
    { productId: 'vase', variantId: 'blue', quantity: 2 },
    { productId: 'vase', variantId: 'blue', quantity: 3 },
    { productId: 'vase', variantId: 'gone', quantity: 1 },
    { productId: 'archived', variantId: 'blue', quantity: 1 },
    { productId: 'vase', variantId: 'blue', quantity: -1 },
  ], products);
  assert.deepEqual(restored.lines, [{ productId: 'vase', variantId: 'blue', quantity: 5 }]);
  assert.equal(restored.removed, 3);
  assert.deepEqual(reconcileCart(restored.lines, []), { lines: [], removed: 1 });
});
