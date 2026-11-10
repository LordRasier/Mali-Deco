import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCardData } from './card-data';
const data = { id: 'p', slug: 'pieza', name: 'Pieza', variantCount: 1, variants: [{ id: 'v', name: 'Única', currency: 'USD', priceMinor: 123, colorInfo: null }] };
test('card bootstrap preserves exact identifiers and currency but rejects malformed or oversized samples', () => {
  assert.equal(parseCardData(JSON.stringify(data)).variants[0].currency, 'USD');
  for (const invalid of [{ ...data, slug: '../bad' }, { ...data, variantCount: -1 }, { ...data, variants: Array(11).fill(data.variants[0]) },
    { ...data, variants: [{ ...data.variants[0], priceMinor: 1.1 }] }, { ...data, variants: [data.variants[0], data.variants[0]] }]) {
    assert.throws(() => parseCardData(JSON.stringify(invalid)));
  }
});
