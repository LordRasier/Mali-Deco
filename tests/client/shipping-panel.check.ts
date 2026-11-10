import test from 'node:test';
import assert from 'node:assert/strict';
import { ShippingSession, shippingCartKey, type ShippingSnapshot } from '../../src/presentation/shared/shipping/shipping-session';
import { shippingPanelState, cartShippingIdentity } from '../../src/presentation/shipping/client/state/shipping-presentation';
import type { CartView } from '../../src/presentation/cart/client/state/cart-snapshot';

const cart: Pick<CartView, 'items' | 'totals' | 'unresolved'> = {
  items: [{ productId: 'p1', variantId: 'v1', quantity: 1, product: null, variant: null }],
  totals: { ARS: 1000n }, unresolved: false,
};
function snapshot(): ShippingSnapshot {
  const now = Date.now();
  return { ...new ShippingSession().getSnapshot(), mode: 'api', cartKey: cartShippingIdentity(cart, 'api').key,
    postalCode: '7600', candidateId: 'A'.repeat(24), lookup: { status: 'resolved', candidates: [{ id: 'A'.repeat(24), label: 'Ciudad' }] },
    quote: { status: 'quoted', packageCount: 1, quotedAt: now, validUntil: now + 60000,
      options: [{ carrierId: 1, carrierName: 'Synthetic', serviceCode: 'standard_delivery', serviceName: 'Delivery', logisticType: 'carrier_dropoff', amountMinor: '500', currency: 'ARS' }] },
  };
}

test('uses the exact cart identity with sorted currency totals', () => {
  const identity = cartShippingIdentity({ ...cart, totals: { USD: 20n, ARS: 1000n } }, 'api');
  assert.equal(identity.key, shippingCartKey('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false, JSON.stringify([['ARS', '1000'], ['USD', '20']])));
});
test('coherent live estimate produces exact combined total', () => {
  const view = shippingPanelState(cart, 'api', snapshot());
  assert.equal(view.shipping?.amountMinor, '500'); assert.deepEqual(view.total, { currency: 'ARS', amountMinor: 1500n });
});

test('cart recalculation identifies shipping work rather than a new locality lookup', () => {
  for (const loading of [false, true]) {
    const state = { ...snapshot(), quote: null, loading };
    const view = shippingPanelState(cart, 'api', state);
    assert.equal(view.busy, true);
    assert.equal(view.message, 'Calculando envío…');
    assert.equal(view.shipping, null);
    assert.equal(view.total, null);
  }
});
test('a selected ambiguous locality remains visible after a successful estimate', () => {
  const state = snapshot(); state.lookup.status = 'ambiguous';
  assert.equal(shippingPanelState(cart, 'api', state).message, 'Destino: Ciudad');
});
test('changed quantities or prices cannot display a previous estimate', () => {
  const old = snapshot();
  for (const changed of [{ ...cart, totals: { ARS: 2000n } }, { ...cart, items: [{ ...cart.items[0], quantity: 2 }] }]) {
    const view = shippingPanelState(changed, 'api', old); assert.equal(view.shipping, null); assert.equal(view.total, null);
  }
});
test('unresolved carts and expired selections never display an estimated total', () => {
  const state = snapshot();
  assert.equal(shippingPanelState({ ...cart, unresolved: true }, 'api', state).total, null);
  state.selection = { choiceKey: '0', shipping: { amountMinor: '500', currency: 'ARS', validUntil: Date.now() - 1 } };
  if (state.quote?.status === 'quoted') state.quote.validUntil = Date.now() - 1;
  const view = shippingPanelState(cart, 'api', state); assert.equal(view.total, null); assert.equal(view.shipping, null); assert.equal(view.retry, true);
});
test('mixed currencies and incompatible selections never produce combined totals', () => {
  const mixed = { ...cart, totals: { ARS: 1000n, USD: 200n } }, state = snapshot(); state.cartKey = cartShippingIdentity(mixed, 'api').key;
  assert.equal(shippingPanelState(mixed, 'api', state).total, null);
  state.cartKey = cartShippingIdentity(cart, 'api').key;
  state.selection = { choiceKey: '0', shipping: { amountMinor: '500', currency: 'USD', validUntil: Date.now() + 60000 } };
  assert.equal(shippingPanelState(cart, 'api', state).total, null);
});
test('cheapest pickup estimate warns without selecting a branch', () => {
  const state = snapshot(); if (state.quote?.status === 'quoted') {
    state.quote.options[0].serviceCode = 'pickup_point'; state.quote.options[0].pickupPoints = [{ id: 7, description: 'Branch' }];
  }
  const view = shippingPanelState(cart, 'api', state);
  assert.match(view.message, /sucursal/); assert.equal(state.selection, null); assert.equal(view.shipping?.amountMinor, '500');
});
test('unavailable and ambiguous responses are explicit rather than free shipping', () => {
  const state = snapshot(); state.quote = { status: 'unavailable', reason: 'DISABLED' };
  const unavailable = shippingPanelState(cart, 'api', state); assert.equal(unavailable.total, null); assert.equal(unavailable.retry, true);
  state.quote = null; state.lookup.status = 'ambiguous'; state.candidateId = null;
  const ambiguous = shippingPanelState(cart, 'api', state); assert.equal(ambiguous.showCandidates, true); assert.equal(ambiguous.total, null);
});

test('missing product measurements explain why a resolved locality cannot be quoted', () => {
  const state = snapshot(); state.quote = { status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' };
  const view = shippingPanelState(cart, 'api', state);
  assert.equal(view.message, 'Faltan el peso o las medidas de algún producto para calcular el envío.');
  assert.equal(view.shipping, null); assert.equal(view.total, null); assert.equal(view.retry, true);
  assert.equal(state.candidateId, 'A'.repeat(24));
});
test('demo never displays API estimates and partial postal input is not an error', () => {
  const state = snapshot(); state.cartKey = cartShippingIdentity(cart, 'demo').key; state.postalCode = '76';
  const view = shippingPanelState(cart, 'demo', state);
  assert.equal(view.total, null); assert.equal(view.shipping, null); assert.equal(view.invalid, false); assert.match(view.message, /demostración/);
  state.postalCode = '76x'; assert.equal(shippingPanelState(cart, 'api', state).invalid, true);
});

test('shipping choices retain provider indices and only expose a coherent current currency', () => {
  const state = snapshot(); if (state.quote?.status !== 'quoted') throw Error('Fixture');
  state.quote.options.unshift({ ...state.quote.options[0], currency: 'USD', amountMinor: '1' });
  let view = shippingPanelState(cart, 'api', state);
  assert.deepEqual(view.choices.map(choice => choice.index), [1]);
  assert.equal(view.choiceKey, '1');
  for (const changed of [{ ...cart, unresolved: true }, { ...cart, totals: { ARS: 1000n, USD: 1n } }]) {
    view = shippingPanelState(changed, 'api', state); assert.deepEqual(view.choices, []); assert.equal(view.choiceKey, null);
  }
  state.quote.validUntil = Date.now() - 1;
  assert.deepEqual(shippingPanelState(cart, 'api', state).choices, []);
  assert.deepEqual(shippingPanelState(cart, 'demo', snapshot()).choices, []);
});

test('manual service and pickup choices project exact selection without inventing a pickup point', () => {
  const state = snapshot(); if (state.quote?.status !== 'quoted') throw Error('Fixture');
  state.quote.options.push({ ...state.quote.options[0], serviceCode: 'pickup_point', amountMinor: '300', pickupPoints: [{id: 9, description: 'Sucursal'}] });
  assert.equal(shippingPanelState(cart, 'api', state).choiceKey, null);
  state.selection = { choiceKey: '1:9', shipping: { amountMinor: '300', currency: 'ARS', validUntil: state.quote.validUntil } };
  const view = shippingPanelState(cart, 'api', state);
  assert.equal(view.choiceKey, '1:9'); assert.equal(view.total?.amountMinor, 1300n);
});

test('calculate action requires a complete eligible postal code and blocks overlapping work', () => {
  const state = snapshot();
  assert.equal(shippingPanelState(cart, 'api', state).canCalculate, true);
  state.postalCode = '76'; assert.equal(shippingPanelState(cart, 'api', state).canCalculate, false);
  state.postalCode = '7600'; state.quote = null; state.loading = true;
  assert.equal(shippingPanelState(cart, 'api', state).canCalculate, false);
  assert.equal(shippingPanelState(cart, 'demo', snapshot()).canCalculate, false);
});
