import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShippingResult, shippingKey, selectedShippingTotal, shippingDestinationErrors, cheapestShipping, invalidPostalCode } from '../src/lib/shipping-client.ts';

const lines = [{ productId: 'p1', variantId: 'v1', quantity: 2 }];
const destination = { country: 'AR', city: 'Mar del Plata', state: 'Buenos Aires', postalCode: '7600' };

test('does not show an error while a numeric postal code is being typed', () => {
  for (const value of ['', '7', '76', '760', '7600']) assert.equal(invalidPostalCode(value),false);
  for (const value of ['76x', '12345', 'B7600ABC']) assert.equal(invalidPostalCode(value),true);
});

test('estimates the cheapest eligible service without choosing a pickup point', () => {
  const home = { carrierId: 1, carrierName: 'A', serviceCode: 'standard_delivery', serviceName: 'Domicilio', logisticType: 'carrier_dropoff', amountMinor: '1100', currency: 'ARS' };
  const pickup = { ...home, carrierId: 2, serviceCode: 'pickup_point', amountMinor: '900', pickupPoints: [{id:7,description:'Sucursal'}] };
  const quote = { status:'quoted', options:[home,pickup], packageCount:1, quotedAt:Date.now(), validUntil:Date.now()+30000 };
  assert.deepEqual(cheapestShipping(quote,{ARS:5000n}),{choiceKey:null,requiresPickup:true,shipping:{amountMinor:'900',currency:'ARS',validUntil:quote.validUntil}});
  assert.equal(cheapestShipping({...quote,options:[pickup,{...home,amountMinor:'800'}]},{ARS:5000n}).choiceKey,'1');
  assert.equal(cheapestShipping({...quote,options:[{...home,amountMinor:'100'}, {...home,amountMinor:'99'}]},{ARS:5000n}).shipping.amountMinor,'99');
  assert.equal(cheapestShipping({...quote,options:[{...home,currency:'USD',amountMinor:'1'},pickup]},{ARS:5000n}).shipping.amountMinor,'900');
  assert.equal(cheapestShipping(quote,{ARS:5000n,USD:1n}),null);
  assert.equal(cheapestShipping(quote,{USD:1n}),null);
  assert.equal(cheapestShipping({status:'unavailable',reason:'NO_OPTIONS'},{ARS:1n}),null);
  assert.equal(cheapestShipping({...quote,validUntil:Date.now()-1},{ARS:5000n}),null);
});

test('shipping identity changes when quantity or destination changes', () => {
  assert.notEqual(shippingKey(lines, destination), shippingKey([{ ...lines[0], quantity: 3 }], destination));
  assert.notEqual(shippingKey(lines, destination), shippingKey(lines, { ...destination, postalCode: '7601' }));
});

test('requires non-whitespace destination fields before calculation', () => {
  assert.deepEqual(shippingDestinationErrors({ ...destination, state: '  ', city: '\t', postalCode: ' ' }), { state: true, city: true, postalCode: true });
  assert.deepEqual(shippingDestinationErrors(destination), { state: false, city: false, postalCode: false });
});

test('adds a selected quote exactly only when the whole cart uses the same currency', () => {
  const shipping = { amountMinor: '1250', currency: 'ARS', validUntil: Date.now() + 30000 };
  assert.deepEqual(selectedShippingTotal({ ARS: 9007199254740991n }, shipping), { currency: 'ARS', amountMinor: 9007199254742241n });
  assert.equal(selectedShippingTotal({ USD: 100n }, shipping), null);
  assert.equal(selectedShippingTotal({ ARS: 100n, USD: 200n }, shipping), null);
  assert.equal(selectedShippingTotal({}, shipping), null);
  assert.equal(selectedShippingTotal({ ARS: 100n }, null), null);
  assert.equal(selectedShippingTotal({ ARS: 100n }, { ...shipping, validUntil: Date.now() - 1 }), null);
});

test('validates provider results and rejects fabricated or incomplete options', () => {
  assert.deepEqual(parseShippingResult({ status: 'unavailable', reason: 'DISABLED' }), { status: 'unavailable', reason: 'DISABLED' });
  const option = { carrierId: 1, carrierName: 'Correo', serviceCode: 'standard_delivery', serviceName: 'Domicilio', logisticType: 'carrier_dropoff', amountMinor: '12345', currency: 'ARS' };
  const quotedAt = Date.now(); const validUntil = quotedAt + 300000;
  assert.equal(parseShippingResult({ status: 'quoted', options: [option], packageCount: 2, quotedAt, validUntil }).status, 'quoted');
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [option], packageCount: 2 }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [option], packageCount: 2, quotedAt: quotedAt - 300001, validUntil: quotedAt - 1 }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [option], packageCount: 2, quotedAt, validUntil: quotedAt + 300001 }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [option], packageCount: 2, quotedAt: quotedAt + 1000, validUntil: validUntil + 1000 }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [{ ...option, amountMinor: '-1' }], packageCount: 2, quotedAt, validUntil }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [option], quotedAt, validUntil }));
  assert.throws(() => parseShippingResult({ status: 'quoted', options: [{ ...option, serviceCode: 'pickup_point', pickupPoints: [] }], packageCount: 1, quotedAt, validUntil }));
});
