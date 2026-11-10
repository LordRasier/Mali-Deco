import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePricing, markupFromAmounts } from './pricing-calculator';

test('cost plus markup, sale plus cost, and sale plus markup calculate the remaining value', () => {
  assert.deepEqual(calculatePricing({ cost: '100', markup: '30', sale: '' }, 'markup', 'ARS'), { sale: '130,00' });
  assert.deepEqual(calculatePricing({ cost: '200', markup: '30', sale: '130' }, 'cost', 'ARS'), { sale: '260,00' });
  assert.deepEqual(calculatePricing({ cost: '100', markup: '30', sale: '150' }, 'sale', 'ARS'), { markup: '50,00' });
  assert.deepEqual(calculatePricing({ cost: '', markup: '30', sale: '130' }, 'markup', 'ARS'), { cost: '100,00' });
  assert.deepEqual(calculatePricing({ cost: '', markup: '30', sale: '260' }, 'sale', 'ARS'), { cost: '200,00' });
  assert.deepEqual(calculatePricing({ cost: '100', markup: '', sale: '130' }, 'cost', 'ARS'), { markup: '30,00' });
});
test('empty, partial and invalid input stays editable without manufacturing zero or NaN', () => {
  for (const cost of ['', ' ', '-', '10,', '1.234,56', '-4', 'abc']) {
    assert.deepEqual(calculatePricing({ cost, markup: '30', sale: '100' }, 'cost', 'ARS'), {});
  }
  assert.deepEqual(calculatePricing({ cost: '', markup: '30', sale: '' }, 'markup', 'ARS'), {});
  assert.deepEqual(calculatePricing({ cost: '100', markup: '', sale: '130' }, 'markup', 'ARS'), {});
  assert.deepEqual(calculatePricing({ cost: '100', markup: '30', sale: '' }, 'sale', 'ARS'), {});
});
test('zero, negative margin, decimals and currency rounding are exact and never divide by zero', () => {
  assert.deepEqual(calculatePricing({ cost: '0', markup: '30', sale: '' }, 'cost', 'ARS'), { sale: '0,00' });
  assert.deepEqual(calculatePricing({ cost: '0', markup: '30', sale: '100' }, 'sale', 'ARS'), { markup: '' });
  assert.deepEqual(calculatePricing({ cost: '', markup: '-100', sale: '0' }, 'markup', 'ARS'), {});
  assert.deepEqual(calculatePricing({ cost: '10,25', markup: '30', sale: '' }, 'markup', 'ARS'), { sale: '13,33' });
  assert.deepEqual(calculatePricing({ cost: '100', markup: '30', sale: '80' }, 'sale', 'ARS'), { markup: '-20,00' });
  assert.deepEqual(calculatePricing({ cost: '101', markup: '30', sale: '' }, 'markup', 'JPY'), { sale: '131' });
  assert.equal(markupFromAmounts('0', '10000'), '');
  assert.equal(markupFromAmounts(null, '10000'), '');
  assert.equal(markupFromAmounts('10000', '0'), '-100,00');
});
