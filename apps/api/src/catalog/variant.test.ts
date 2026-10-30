import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateVariant } from './variant';

const valid = { sku: 'PLA-RED', name: 'Rojo', priceMinor: 15000, currency: 'ARS' };

test('accepts a complete variant and rejects blank or oversized fields', () => {
  assert.doesNotThrow(() => validateVariant(valid));
  for (const field of ['sku', 'name'] as const) {
    assert.throws(() => validateVariant({ ...valid, [field]: '  ' }));
    assert.throws(() => validateVariant({ ...valid, [field]: 'x'.repeat(256) }));
  }
});

test('requires a nonnegative safe integer amount and uppercase currency code', () => {
  for (const priceMinor of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateVariant({ ...valid, priceMinor }));
  }
  for (const currency of ['ars', 'AR', 'A1S', ' ARS', 'ARS\n']) {
    assert.throws(() => validateVariant({ ...valid, currency }));
  }
  assert.doesNotThrow(() => validateVariant({ ...valid, priceMinor: 0, currency: 'USD' }));
});
