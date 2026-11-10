import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardOptions } from './card-options';
import type { Product, Variant } from './storefront-types';

const variant = (id: number): Variant => ({ id: `v${id}`, name: `Opción ${id}`, currency: 'ARS', priceMinor: 100 * id });
const product = (count: number, variants = Array.from({ length: count }, (_, i) => variant(i + 1))): Product =>
  ({ id: 'p', slug: 'pieza', name: 'Pieza', description: '', variantCount: count, variants });

test('zero options cannot be purchased; complete choices default to the first visible variant', () => {
  assert.equal(cardOptions(product(0)).kind, 'none');
  assert.equal(cardOptions(product(1)).selected?.id, 'v1');
  assert.equal(cardOptions(product(3)).selected?.id, 'v1');
  assert.equal(cardOptions(product(3)).kind, 'buttons');
  assert.equal(cardOptions(product(4)).kind, 'select');
});

test('filtered or truncated samples and unknown totals always need complete options', () => {
  assert.equal(cardOptions(product(101, [variant(1)])).kind, 'more');
  assert.equal(cardOptions(product(11, Array.from({ length: 10 }, (_, i) => variant(i)))).kind, 'more');
  assert.equal(cardOptions({ ...product(1), variantCount: undefined }).kind, 'more');
  assert.equal(cardOptions(product(3, [variant(1)])).selected, undefined);
});

test('colors require unique valid hex and names; no invented dimension combinations', () => {
  const colors = ['#123456', '#abcdef', '#000000'].map((hex, i) => ({ ...variant(i), colorInfo: { id: `c${i}`, slug: `c${i}`, name: `Color ${i}`, hex } }));
  assert.equal(cardOptions(product(3, colors)).kind, 'colors');
  assert.equal(cardOptions(product(3, [colors[0], { ...colors[1], colorInfo: colors[0].colorInfo }, colors[2]])).kind, 'buttons');
  assert.equal(cardOptions(product(3, [colors[0], { ...colors[1], colorInfo: { ...colors[1].colorInfo, hex: 'red' } }, colors[2]])).kind, 'buttons');
  assert.deepEqual(cardOptions(product(3)).options.map(v => v.name), ['Opción 1', 'Opción 2', 'Opción 3']);
});

test('only six color circles are initially visible while all choices remain available', () => {
  const variants = Array.from({ length: 8 }, (_, i) => ({ ...variant(i), colorInfo: { id: `c${i}`, slug: `c${i}`, name: `Color ${i}`, hex: `#00000${i}` } }));
  const options = cardOptions(product(8, variants));
  assert.equal(options.visible.length, 6); assert.equal(options.options.length, 8); assert.equal(options.hasMore, true);
});
