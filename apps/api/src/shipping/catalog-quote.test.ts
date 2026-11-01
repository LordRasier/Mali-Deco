import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { CatalogShippingResolver, parseQuoteIntent, pendingShippingService, ShippingQuoteService } from './catalog-quote';

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

test('disabled service never calls catalog or transport', async () => {
  let calls = 0;
  const service = new ShippingQuoteService(async () => { calls++; return { status: 'quoted', options: [] }; });
  assert.deepEqual(await service.quote(intent), { status: 'unavailable', reason: 'DISABLED' });
  assert.equal(calls, 0);
  const dbCalls: unknown[] = [];
  const composed = pendingShippingService(database([row], dbCalls), { ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'fake-token', ZIPNOVA_API_SECRET: 'fake-secret', ZIPNOVA_ACCOUNT_ID: '4', ZIPNOVA_ORIGIN_ID: '8', ZIPNOVA_CURRENCY: 'ARS', ZIPNOVA_CURRENCY_EXPONENT: '2' });
  assert.deepEqual(await composed.quote(intent), { status: 'unavailable', reason: 'DISABLED' });
  assert.equal(dbCalls.length, 0);
});
