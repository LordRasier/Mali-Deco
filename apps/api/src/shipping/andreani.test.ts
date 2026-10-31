import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeAndreaniQuery } from './andreani-query';
import { parseAndreaniQuote } from './andreani-response';
import { AndreaniQuoteAdapter, DisabledShippingProvider } from './shipping-provider';

const parcel = { widthMm: 101, heightMm: 205, lengthMm: 300, weightGrams: 1250, declaredValue: '1234.50' };
const input = { destinationPostalCode: '1406', parcel };
const account = { contract: 'CONTRATO', customer: 'CLIENTE' };
const money = { currency: 'ARS', exponent: 2 };
const response = { pesoAforado: '1.25', tarifaSinIva: { seguroDistribucion: '10.00', distribucion: '90.00', total: '100.00' }, tarifaConIva: { seguroDistribucion: '12.10', distribucion: '108.90', total: '121.00' } };

test('serializes one packaged parcel with exact mm, grams and volume conversion', () => {
  const query = serializeAndreaniQuery(input, account);
  assert.equal(query.get('cpDestino'), '1406');
  assert.equal(query.get('contrato'), 'CONTRATO');
  assert.equal(query.get('cliente'), 'CLIENTE');
  assert.equal(query.get('bultos[0][volumen]'), '6211.5');
  assert.equal(query.get('bultos[0][kilos]'), '1.25');
  assert.equal(query.get('bultos[0][anchoCm]'), '10.1');
  assert.equal(query.get('bultos[0][altoCm]'), '20.5');
  assert.equal(query.get('bultos[0][largoCm]'), '30');
  assert.equal(query.get('bultos[0][valorDeclarado]'), '1234.50');
  assert.equal(query.has('bultos[1][volumen]'), false);
  const minimal = serializeAndreaniQuery({ destinationPostalCode: 'C1406ABC', parcel: { widthMm: 1, heightMm: 1, lengthMm: 1 } }, { ...account, originBranch: '1' });
  assert.equal(minimal.get('bultos[0][volumen]'), '0.001');
  assert.equal(minimal.has('bultos[0][kilos]'), false);
  assert.equal(minimal.get('sucursalOrigen'), '1');
});

test('rejects malformed or unsafe dimensions, values, destination and account identifiers', () => {
  for (const widthMm of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => serializeAndreaniQuery({ ...input, parcel: { ...parcel, widthMm } }, account));
  }
  for (const declaredValue of ['-1', '1e3', '1,20', 'NaN', ' 1', '']) {
    assert.throws(() => serializeAndreaniQuery({ ...input, parcel: { ...parcel, declaredValue } }, account));
  }
  assert.throws(() => serializeAndreaniQuery({ ...input, destinationPostalCode: ' ' }, account));
  assert.throws(() => serializeAndreaniQuery(input, { ...account, contract: '\n' }));
});

test('parses gross total exactly with explicitly configured currency, without adding IVA', () => {
  assert.deepEqual(parseAndreaniQuote(response, money), { amountMinor: '12100', currency: 'ARS' });
  assert.deepEqual(parseAndreaniQuote({ ...response, tarifaConIva: { ...response.tarifaConIva, total: '90071992547409.91' } }, money), { amountMinor: '9007199254740991', currency: 'ARS' });
  assert.deepEqual(parseAndreaniQuote({ ...response, tarifaConIva: { ...response.tarifaConIva, total: '0.001' } }, { currency: 'KWD', exponent: 3 }), { amountMinor: '1', currency: 'KWD' });
});

test('rejects invalid or incomplete provider responses and currency configuration', () => {
  for (const total of ['-1', '1e3', '1,00', '1.001', '', 123, null]) {
    assert.throws(() => parseAndreaniQuote({ ...response, tarifaConIva: { ...response.tarifaConIva, total } }, money));
  }
  assert.throws(() => parseAndreaniQuote({ ...response, pesoAforado: null }, money));
  assert.throws(() => parseAndreaniQuote({ ...response, tarifaSinIva: {} }, money));
  assert.throws(() => parseAndreaniQuote(response, { currency: '', exponent: 2 }));
  assert.throws(() => parseAndreaniQuote(response, { currency: 'ARS', exponent: -1 }));
});

test('disabled and fake transport failures remain unavailable, never no coverage', async () => {
  assert.deepEqual(await new DisabledShippingProvider().quote(), { status: 'unavailable', reason: 'disabled' });
  for (const status of [401, 403, 404, 500]) {
    const adapter = new AndreaniQuoteAdapter(account, money, async () => ({ status, body: null }));
    assert.deepEqual(await adapter.quote(input), { status: 'unavailable', reason: 'provider_error' });
  }
  const timeout = new AndreaniQuoteAdapter(account, money, async () => { throw new Error('timeout'); });
  assert.deepEqual(await timeout.quote(input), { status: 'unavailable', reason: 'provider_error' });
  const invalid = new AndreaniQuoteAdapter(account, money, async () => ({ status: 200, body: {} }));
  assert.deepEqual(await invalid.quote(input), { status: 'unavailable', reason: 'invalid_response' });
  const success = new AndreaniQuoteAdapter(account, money, async query => {
    assert.equal(query.get('bultos[0][volumen]'), '6211.5');
    return { status: 200, body: response };
  });
  assert.deepEqual(await success.quote(input), { status: 'quoted', amountMinor: '12100', currency: 'ARS' });
});
