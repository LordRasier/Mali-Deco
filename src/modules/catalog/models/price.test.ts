import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertMinorUnits } from './price';

test('accepts nonnegative integral minor units and rejects invalid prices', () => {
  for (const value of [0, 1, 12345]) assert.doesNotThrow(() => assertMinorUnits(value));
  for (const value of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertMinorUnits(value));
  }
});
