import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeliveryHint, restoreDeliveryChoice } from '../../src/presentation/shared/checkout/checkout-handoff';
import type { ShippingSnapshot } from '../../src/presentation/shared/shipping/shipping-session';
import type { Quote } from '../../src/presentation/shared/checkout/checkout-client';

const lines = [{ productId: 'p', variantId: 'v', quantity: 1 }];
const destination = { postalCode: '7600', candidateId: 'a'.repeat(24) };
const option = { carrierId: 1, carrierName: 'Carrier', serviceName: 'Home', serviceCode: 'home', logisticType: 'dropoff', currency: 'ARS', amountMinor: '100' };
const snapshot: ShippingSnapshot = { mode: 'api', cartKey: '', ...destination, lookup: { status: 'resolved', candidates: [{ id: destination.candidateId, label: 'City' }] }, quote: { status: 'quoted', options: [option], quotedAt: 1000, validUntil: 301000, packageCount: 1 }, selection: null, loading: false, error: false, expired: false, estimateEnabled: true };
const quote: Quote = { quoteId: 'new', validUntil: 301000, options: [{ ...option, id: 'fresh-option', amountMinor: '250' }] };

test('handoff retains only a preference; selection and changed price come from the fresh server quote', () => {
  const raw = createDeliveryHint(snapshot, '0', lines, 1000)!;
  assert.doesNotMatch(raw, /amountMinor|price|contact|email|address|quoteId/);
  assert.deepEqual(restoreDeliveryChoice(raw, lines, destination, quote, 1100), { option: 'fresh-option', point: '' });
});

test('stale, malformed, changed cart/destination and ambiguous service hints do not select anything', () => {
  const raw = createDeliveryHint(snapshot, '0', lines, 1000)!;
  for (const value of [null, '{}', 'bad', 'x'.repeat(20000)]) assert.equal(restoreDeliveryChoice(value, lines, destination, quote, 1100), null);
  assert.equal(restoreDeliveryChoice(raw, [{ ...lines[0], quantity: 2 }], destination, quote, 1100), null);
  assert.equal(restoreDeliveryChoice(raw, lines, { ...destination, candidateId: 'b'.repeat(24) }, quote, 1100), null);
  assert.equal(restoreDeliveryChoice(raw, lines, destination, quote, 301000), null);
  assert.equal(restoreDeliveryChoice(raw, lines, destination, { ...quote, options: [...quote.options, { ...quote.options[0], id: 'duplicate' }] }, 1100), null);
});

test('pickup preference requires an explicitly selected point still present in the fresh quote', () => {
  const pickup = { ...snapshot, quote: { ...snapshot.quote!, status: 'quoted' as const, quotedAt: 1000, validUntil: 301000, packageCount: 1, options: [{ ...option, serviceCode: 'pickup_point', pickupPoints: [{ id: 7, description: 'Point' }] }] } };
  assert.equal(createDeliveryHint(pickup, '0', lines, 1000), null);
  const raw = createDeliveryHint(pickup, '0:7', lines, 1000)!;
  const fresh = { ...quote, options: [{ ...quote.options[0], serviceCode: 'pickup_point', pickupPoints: [{ id: 7, description: 'Point' }] }] };
  assert.deepEqual(restoreDeliveryChoice(raw, lines, destination, fresh, 1100), { option: 'fresh-option', point: '7' });
  assert.equal(restoreDeliveryChoice(raw, lines, destination, { ...fresh, options: [{ ...fresh.options[0], pickupPoints: [{ id: 8, description: 'Other' }] }] }, 1100), null);
});
