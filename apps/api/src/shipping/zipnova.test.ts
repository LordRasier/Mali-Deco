import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeZipnovaQuote, parseZipnovaQuote } from './zipnova';
import { DisabledOptionsProvider, ZipnovaQuoteAdapter, type QuoteIntent } from './zipnova-provider';
import { QuoteSession, quoteFingerprint } from './quote-session';

const config = { accountId: 4, originId: 8, source: 'store', currency: 'ARS', exponent: 2 };
const destination = { country: 'AR' as const, postalCode: '7600', city: 'Mar del Plata', state: 'Buenos Aires' };
const parcel = { widthMm: 160, heightMm: 120, lengthMm: 190, weightGrams: 1000, classificationId: '1' };
const resolved = { destination, packages: [parcel], declaredValue: 123.45 };
const intent: QuoteIntent = { destination, lines: [{ productId: 'p1', variantId: 'v1', quantity: 2 }] };
const option = { selectable: true, impediments: null, logistic_type: 'carrier_dropoff', carrier: { id: 1, name: 'Correo' }, service_type: { code: 'standard_delivery', name: 'Domicilio' }, amounts: { price_incl_tax: 121.25, seller_price: 1 } };

test('serializes trusted, already packed parcels with exact units', () => {
  const result = serializeZipnovaQuote(resolved, config);
  assert.deepEqual(result, { account_id: 4, origin_id: 8, source: 'store', declared_value: 123.45, destination: { city: 'Mar del Plata', state: 'Buenos Aires', zipcode: '7600' }, packages: [{ width: 16, height: 12, length: 19, weight: 1000, classification_id: '1' }] });
  assert.equal('items' in result, false);
  for (const widthMm of [161, 0, -1, 1.5, 50001]) assert.throws(() => serializeZipnovaQuote({ ...resolved, packages: [{ ...parcel, widthMm }] }, config));
  assert.throws(() => serializeZipnovaQuote({ ...resolved, packages: [] }, config));
  assert.throws(() => serializeZipnovaQuote({ ...resolved, declaredValue: 12.345 }, config));
});

test('uses gross buyer amount and only actionable options including pickup points', () => {
  const pickup = { ...option, service_type: { code: 'pickup_point', name: 'Sucursal' }, pickup_points: [{ point_id: 7, description: 'Sucursal centro' }] };
  const parsed = parseZipnovaQuote({ all_results: [option, { ...option, selectable: false, impediments: ['no'] }, pickup, { ...pickup, pickup_points: [] }] }, config);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].amountMinor, '12125');
  assert.equal(parsed[0].currency, 'ARS');
  assert.deepEqual(parsed[1].pickupPoints, [{ id: 7, description: 'Sucursal centro' }]);
  assert.throws(() => parseZipnovaQuote({ all_results: [option] }, { ...config, currency: '' }));
  assert.throws(() => parseZipnovaQuote({ all_results: [{ ...option, amounts: { price_incl_tax: 1.234 } }] }, config));
  assert.throws(() => parseZipnovaQuote({}, config));
});

test('fails closed before transport when catalog or packaging is unavailable', async () => {
  let calls = 0;
  const transport = async () => { calls++; return { status: 200, body: { all_results: [option] } }; };
  const catalogUnavailable = new ZipnovaQuoteAdapter(config, async () => ({ status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' }), transport);
  assert.deepEqual(await catalogUnavailable.quote(intent), { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' });
  const logisticsUnavailable = new ZipnovaQuoteAdapter(config, async () => ({ status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' }), transport);
  assert.deepEqual(await logisticsUnavailable.quote(intent), { status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' });
  assert.equal(calls, 0);
  assert.deepEqual(await new DisabledOptionsProvider().quote(), { status: 'unavailable', reason: 'DISABLED' });
  const invalidConfig = new ZipnovaQuoteAdapter({ ...config, currency: '' }, async () => ({ status: 'resolved', value: resolved }), transport);
  assert.deepEqual(await invalidConfig.quote(intent), { status: 'unavailable', reason: 'CONFIG_UNAVAILABLE' });
  assert.equal(calls, 0);
});

test('classifies provider failures and never interprets them as free shipping', async () => {
  const resolver = async () => ({ status: 'resolved' as const, value: resolved });
  for (const [status, reason] of [[401, 'AUTH_ERROR'], [403, 'AUTH_ERROR'], [429, 'RATE_LIMITED'], [422, 'DESTINATION_OR_LOGISTICS_INVALID'], [500, 'PROVIDER_ERROR']] as const) {
    const adapter = new ZipnovaQuoteAdapter(config, resolver, async () => ({ status, body: null }));
    assert.deepEqual(await adapter.quote(intent), { status: 'unavailable', reason });
  }
  const invalid = new ZipnovaQuoteAdapter(config, resolver, async () => ({ status: 200, body: {} }));
  assert.deepEqual(await invalid.quote(intent), { status: 'unavailable', reason: 'INVALID_RESPONSE' });
  const empty = new ZipnovaQuoteAdapter(config, resolver, async () => ({ status: 200, body: { all_results: [] } }));
  assert.deepEqual(await empty.quote(intent), { status: 'unavailable', reason: 'NO_OPTIONS' });
  const timeout = new ZipnovaQuoteAdapter(config, resolver, async () => { const error = new Error(); error.name = 'TimeoutError'; throw error; });
  assert.deepEqual(await timeout.quote(intent), { status: 'unavailable', reason: 'TIMEOUT' });
});

test('invalidates options when the cart or destination changes and discards older responses', async () => {
  const session = new QuoteSession();
  let finish!: (value: Awaited<ReturnType<ZipnovaQuoteAdapter['quote']>>) => void;
  const old = session.request(intent, () => new Promise(resolve => { finish = resolve; }));
  const changed = { ...intent, destination: { ...destination, postalCode: '5000', city: 'Córdoba' } };
  assert.notEqual(quoteFingerprint(intent), quoteFingerprint(changed));
  assert.notEqual(quoteFingerprint(intent), quoteFingerprint({ ...intent, lines: [{ ...intent.lines[0], quantity: 3 }] }));
  session.update(changed);
  finish({ status: 'quoted', options: [] });
  await old;
  assert.equal(session.result, undefined);
  await session.request(changed, async () => ({ status: 'unavailable', reason: 'NO_OPTIONS' }));
  assert.deepEqual(session.result, { status: 'unavailable', reason: 'NO_OPTIONS' });
  session.update(intent);
  assert.equal(session.result, undefined);
});
