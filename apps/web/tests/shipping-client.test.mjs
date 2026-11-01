import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShippingResult, shippingKey } from '../src/lib/shipping-client.ts';

const lines = [{ productId: 'p1', variantId: 'v1', quantity: 2 }];
const destination = { country: 'AR', city: 'Mar del Plata', state: 'Buenos Aires', postalCode: '7600' };

test('shipping identity changes when quantity or destination changes', () => {
  assert.notEqual(shippingKey(lines, destination), shippingKey([{ ...lines[0], quantity: 3 }], destination));
  assert.notEqual(shippingKey(lines, destination), shippingKey(lines, { ...destination, postalCode: '7601' }));
});

test('validates provider results and rejects fabricated or incomplete options', () => {
  assert.deepEqual(parseShippingResult({ status: 'unavailable', reason: 'DISABLED' }), { status: 'unavailable', reason: 'DISABLED' });
  const option = { carrierId: 1, carrierName: 'Correo', serviceCode: 'standard_delivery', serviceName: 'Domicilio', logisticType: 'carrier_dropoff', amountMinor: '12345', currency: 'ARS' };
  assert.equal(parseShippingResult({ status: 'quoted', options: [option], packageCount: 2 }).status, 'quoted');
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [{ ...option, amountMinor: '-1' }], packageCount: 2 }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [option] }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [{ ...option, serviceCode: 'pickup_point', pickupPoints: [] }], packageCount: 1 }));
});
