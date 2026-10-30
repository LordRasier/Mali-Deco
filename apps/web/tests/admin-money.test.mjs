import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalToMinor, minorToDecimal } from '../src/admin/money.ts';

test('monetary conversion respects currency scale and uses integer arithmetic', () => {
  assert.equal(decimalToMinor('123,45', 'ARS'), 12345);
  assert.equal(decimalToMinor('123', 'JPY'), 123);
  assert.equal(decimalToMinor('1.234', 'KWD'), 1234);
  assert.equal(minorToDecimal('12345', 'ARS'), '123.45');
  assert.equal(minorToDecimal('1', 'KWD'), '0.001');
  assert.equal(minorToDecimal('900719925474099100', 'ARS'), '9007199254740991.00');
});
test('conversion rejects rounding, negatives, invalid currency, and unsafe integers', () => {
  assert.equal(decimalToMinor('90071992547409.91', 'ARS'), Number.MAX_SAFE_INTEGER);
  for (const [value, currency] of [['90071992547409.92', 'ARS'], ['1.234', 'ARS'], ['1.1', 'JPY'], ['-1', 'ARS'], ['1e3', 'ARS'], ['1', 'ar']]) {
    assert.throws(() => decimalToMinor(value, currency));
  }
});
