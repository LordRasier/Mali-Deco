import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { CatalogShippingResolver, parseQuoteIntent, pendingShippingService, ShippingQuoteService } from './catalog-quote';
import { serializeZipnovaDynamicQuote } from './zipnova';

const intent = { destination: { country: 'AR', city: 'Mar del Plata', state: 'Buenos Aires', postalCode: '7600' }, lines: [{ productId: 'p1', variantId: 'v1', quantity: 2 }] };
const row = { productId: 'p1', variantId: 'v1', name: 'Florero', weightGrams: 400, widthMm: 101, heightMm: 200, lengthMm: 120, priceMinor: '1250', currency: 'ARS' };
function database(rows: unknown[], capture: unknown[] = []): DataSource {
  return { isInitialized: true, query: async (_sql: string, parameters: unknown[]) => { capture.push(parameters); return rows; } } as unknown as DataSource;
}

test('accepts only identifiers, quantity and destination; rejects duplicates and untrusted logistics', () => {
  assert.deepEqual(parseQuoteIntent(intent), intent);
  assert.throws(() => parseQuoteIntent({ ...intent, price: 1 }));
  assert.throws(() => parseQuoteIntent({ ...intent, lines: [{ ...intent.lines[0], weightGrams: 1 }] }));
  assert.throws(() => parseQuoteIntent({ ...intent, lines: [intent.lines[0], intent.lines[0]] }));
  assert.throws(() => parseQuoteIntent({ ...intent, lines: [{ ...intent.lines[0], quantity: 1001 }] }));
});

test('resolves prices and per-unit measurements from the database, not the request', async () => {
  const calls: unknown[] = [];
  const result = await new CatalogShippingResolver(database([row], calls), { currency: 'ARS', exponent: 2 }).resolve(parseQuoteIntent(intent));
  assert.equal(result.status, 'resolved');
  if (result.status === 'resolved' && 'items' in result.value) {
    assert.equal(result.value.declaredValue, 25);
    assert.deepEqual(result.value.items[0], { description: 'Florero', quantity: 2, weightGrams: 400, widthMm: 101, heightMm: 200, lengthMm: 120 });
  }
  assert.deepEqual(calls, [['p1', 'v1']]);
});

test('missing catalog or incomplete measurements fail closed', async () => {
  assert.deepEqual(await new CatalogShippingResolver(undefined, { currency: 'ARS', exponent: 2 }).resolve(parseQuoteIntent(intent)), { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' });
  assert.deepEqual(await new CatalogShippingResolver(database([]), { currency: 'ARS', exponent: 2 }).resolve(parseQuoteIntent(intent)), { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' });
  assert.deepEqual(await new CatalogShippingResolver(database([{ ...row, weightGrams: null }]), { currency: 'ARS', exponent: 2 }).resolve(parseQuoteIntent(intent)), { status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' });
  const one = parseQuoteIntent({ ...intent, lines: [{ ...intent.lines[0], quantity: 1 }] });
  assert.deepEqual(await new CatalogShippingResolver(database([{ ...row, priceMinor: '9007199254740991' }]), { currency: 'ARS', exponent: 2 }).resolve(one), { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' });
});

test('preserves valid Unicode product names of 151 and 255 characters in the provider request', async () => {
  const config = { accountId: 4, originId: 8, source: 'store', currency: 'ARS', exponent: 2 };
  for (const name of ['Á'.repeat(150) + 'ñ', 'Á'.repeat(254) + 'ñ', '  Ángel 🏺  ']) {
    const result = await new CatalogShippingResolver(database([{ ...row, name }]), config).resolve(parseQuoteIntent(intent));
    assert.equal(result.status, 'resolved');
    if (result.status === 'resolved' && 'items' in result.value) {
      assert.equal(serializeZipnovaDynamicQuote(result.value, config).items[0].description, name);
    }
  }
});

test('disabled service never calls catalog or transport', async () => {
  let calls = 0;
  const service = new ShippingQuoteService(async () => { calls++; return { status: 'quoted', options: [] }; });
  assert.deepEqual(await service.quote(intent), { status: 'unavailable', reason: 'DISABLED' });
  assert.equal(calls, 0);
  const dbCalls: unknown[] = [];
  const composed = pendingShippingService(database([row], dbCalls), {});
  assert.deepEqual(await composed.quote(intent), { status: 'unavailable', reason: 'DISABLED' });
  assert.equal(dbCalls.length, 0);
});

const enabledEnv = { ZIPNOVA_ENABLED: 'true', ZIPNOVA_LOGISTICS_VALIDATED: 'true', ZIPNOVA_API_TOKEN: 'fake-token', ZIPNOVA_API_SECRET: 'fake-secret', ZIPNOVA_ACCOUNT_ID: '4', ZIPNOVA_ORIGIN_ID: '8', ZIPNOVA_CURRENCY: 'ARS', ZIPNOVA_CURRENCY_EXPONENT: '2' };

test('configuration and authoritative catalog failures never invoke network', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error('unexpected'); };
  for (const env of [
    { ...enabledEnv, ZIPNOVA_LOGISTICS_VALIDATED: undefined },
    { ...enabledEnv, ZIPNOVA_API_SECRET: undefined },
    { ...enabledEnv, ZIPNOVA_ORIGIN_ID: '' },
    { ...enabledEnv, ZIPNOVA_CURRENCY_EXPONENT: '' },
    { ...enabledEnv, ZIPNOVA_ENABLED: 'yes' },
  ]) assert.deepEqual(await pendingShippingService(database([row]), env, fetcher).quote(intent), { status: 'unavailable', reason: 'CONFIG_UNAVAILABLE' });
  assert.deepEqual(await pendingShippingService(undefined, enabledEnv, fetcher).quote(intent), { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' });
  assert.deepEqual(await pendingShippingService(database([{ ...row, widthMm: null }]), enabledEnv, fetcher).quote(intent), { status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' });
  assert.equal(calls, 0);
});

test('explicitly enabled configuration quotes using database measurements and the fixed endpoint', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.zipnova.com.ar/v2/shipments/quote');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.origin_id, 8);
    assert.equal(payload.account_id, 4);
    assert.equal(payload.declared_value, 25);
    assert.equal(payload.type_packaging, 'dynamic');
    assert.equal(payload.items.length, 2);
    assert.equal(payload.items[0].weight, 400);
    assert.equal(payload.items[0].width, 11);
    return new Response(JSON.stringify({ packages: [{ width: 16, height: 12, length: 19, weight: 1000 }, { width: 16, height: 12, length: 19, weight: 1000 }], all_results: [{ selectable: true, impediments: null, logistic_type: 'carrier_dropoff', carrier: { id: 1, name: 'Correo' }, service_type: { code: 'standard_delivery', name: 'Domicilio' }, amounts: { price_incl_tax: 121.25 } }] }), { status: 200 });
  };
  const result = await pendingShippingService(database([row]), enabledEnv, fetcher).quote(intent);
  assert.equal(result.status, 'quoted', JSON.stringify(result));
  if (result.status === 'quoted') { assert.equal(result.packageCount, 2); assert.equal(result.options[0].amountMinor, '12125'); }
  assert.equal(calls, 1);
});
