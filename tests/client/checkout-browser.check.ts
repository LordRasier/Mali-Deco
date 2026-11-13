import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckoutView } from '../../src/presentation/checkout/client/browser/checkout-view';
import { mountCheckout } from '../../src/presentation/checkout/client/browser/checkout-browser';
import { createCheckoutStore, type CheckoutSnapshot } from '../../src/presentation/checkout/client/state/checkout-store';
import { ShippingSession, type ShippingSnapshot } from '../../src/presentation/shared/shipping/shipping-session';
import type { CartView } from '../../src/presentation/cart/client/state/cart-snapshot';
import { bulkWarnings } from '../../src/presentation/shared/cart/inventory';

test('bulk warnings aggregate variants and include the configured threshold once', () => {
  const product = { ...cart.items[0].product!, bulkWarningThreshold: 3, bulkWarningMessage: '<strong>Large order</strong>' };
  const first = { ...cart.items[0], quantity: 2, product }, second = { ...first, variantId: 'v2', quantity: 1 };
  assert.deepEqual(bulkWarnings([first]), []);
  assert.deepEqual(bulkWarnings([first, second]), [{ id: 'p', text: '<img src=x>: <strong>Large order</strong>' }]);
});

test('checkout quantity controls stay compact and stable, respect stock and lock during orders', () => {
  const d = dom(), view = createCheckoutView(d.root), calls: unknown[] = [];
  const state = snapshot(), limited = { ...cart, items: [{ ...cart.items[0], product: cart.items[0].product!, variant: { ...cart.items[0].variant!, supplyMode: 'stock' as const, stockQuantity: 2 } }] };
  view.bind({ setContact() {}, setAddress() {}, placeOrder() {}, requestQuote() {}, findDestination() {}, setPostalCode() {}, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {}, changeQuantity: (...args) => { calls.push(args); } });
  view.render(state, shipping, limited);
  const controls = d.get('lines').children[0].children[1].children[3], minus = controls.children[0].children[0], plus = controls.children[0].children[2], remove = controls.children[1];
  assert.equal(minus.disabled, true); assert.equal(plus.disabled, false);
  assert.equal(remove.children[0]?.attributes.get('viewBox'), '0 0 24 24');
  plus.dispatchEvent(new Event('click')); assert.deepEqual(calls, [['p', 'v', 1]]);
  view.render(state, shipping, { ...limited, items: [{ ...limited.items[0], quantity: 2 }] });
  assert.equal(d.get('lines').children[0].children[1].children[3], controls); assert.equal(plus.disabled, true); assert.equal(minus.disabled, false);
  view.render({ ...state, locked: true }, shipping, limited); remove.dispatchEvent(new Event('click')); assert.equal(calls.length, 1); assert.equal(remove.disabled, true);
  view.dispose();
});

// Controlled DOM ports test binding, retained nodes and text safety, not layout/browser parsing.
class NodeDouble extends EventTarget {
  hidden = false; disabled = false; value = ''; checked = false; type = ''; name = ''; className = '';
  private ownText = '';
  get textContent() { return this.ownText + this.children.map(node => node.textContent).join(''); }
  set textContent(value: string) { this.ownText = value; this.children = []; }
  children: NodeDouble[] = []; attributes = new Map<string, string>(); focused = 0; validity = true;
  ownerDocument = { createElement: () => new NodeDouble(), createElementNS: () => new NodeDouble() };
  set innerHTML(_value: string) { throw Error('HTML injection is forbidden'); }
  append(...nodes: NodeDouble[]) { this.children.push(...nodes); }
  insertBefore(node: NodeDouble, target: NodeDouble | null) { this.children = this.children.filter(child => child !== node); const index = target ? this.children.indexOf(target) : -1; if (index < 0) this.children.push(node); else this.children.splice(index, 0, node); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  contains() { return false; }
  remove() {}
  after() {}
  replaceChildren(...nodes: NodeDouble[]) { this.children = nodes; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  focus() { this.focused++; }
  reportValidity() { return this.validity; }
}
function dom() {
  const nodes = new Map<string, NodeDouble>();
  const names = ['name', 'email', 'phone', 'document', 'street', 'number', 'unit', 'form', 'fields', 'error-box', 'error', 'reset-box', 'reset', 'reset-unavailable',
    'pending', 'retry', 'check', 'order', 'order-reference', 'order-total', 'loading', 'empty', 'postal', 'lookup', 'candidates-box', 'candidates',
    'destination-message', 'quote', 'options-box', 'options', 'point-box', 'point', 'expired', 'lines', 'unresolved', 'totals', 'shipping-total', 'grand-total', 'total-message', 'submit', 'delivery', 'payment-box', 'payment-message', 'payment-start', 'payment-refresh', 'payment-link', 'order-payment-status', 'new-order'];
  for (const name of names) nodes.set(`[data-checkout-${name}]`, new NodeDouble());
  const root = Object.assign(new NodeDouble(), { querySelector: (selector: string) => nodes.get(selector) ?? null });
  return { root: root as unknown as HTMLElement, get: (name: string) => nodes.get(`[data-checkout-${name}]`)! };
}
function snapshot(): CheckoutSnapshot {
  return { quote: { quoteId: 'q', validUntil: Date.now() + 10000, options: [{ id: 'o', carrierName: '<img src=x>', serviceName: 'Home', serviceCode: 'home', amountMinor: '100', currency: 'ARS' }] }, expired: false,
    option: 'o', point: '', quoteBusy: false, sending: false, error: '', invalidSession: false, order: null, pending: null, loaded: true, focusRequest: 0,
    contact: { name: 'Private', email: 'a@example.invalid', phone: '123' }, address: { street: 'Street', number: '1', unit: '' }, canRetry: false, locked: false };
}
const shipping: ShippingSnapshot = { mode: 'api', cartKey: null, postalCode: '1000', candidateId: 'city', lookup: { status: 'resolved', candidates: [{ id: 'city', label: '<script>City</script>' }] }, quote: null, selection: null, loading: false, error: false, expired: false, estimateEnabled: false };
const cart: CartView = { stockShortage: false, bulkWarnings: [], ready: true, status: 'idle', removedNotice: 0, storageUnavailable: false, storageTabOnly: false, unresolved: false, count: 1,
  items: [{ productId: 'p', variantId: 'v', quantity: 1, product: { id: 'p', name: '<img src=x>', slug: 'p', description: '', variants: [] }, variant: { id: 'v', name: 'V', priceMinor: 100, currency: 'ARS' } }], totals: { ARS: 100n } };

test('payment panel exposes prepared links and reports uncertain/verified results honestly', () => {
  const d = dom(), view = createCheckoutView(d.root);
  const state: CheckoutSnapshot = { ...snapshot(), order: { id: 'order', testLocal: true, orderStatus: 'received', paymentStatus: 'pending', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', currency: 'ARS', totalMinor: '100', paymentAvailable: true } };
  view.render({ ...state, payment: { status: 'ready', url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-pref' } }, shipping, cart);
  assert.equal(d.get('payment-box').hidden, false); assert.equal(d.get('payment-link').hidden, false);
  assert.equal(d.get('payment-link').focused, 0);
  const ready = { ...state, paymentFocus: 1, payment: { status: 'ready' as const, url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-pref' } };
  view.render(ready, shipping, cart); assert.equal(d.get('payment-link').focused, 1);
  view.render(ready, shipping, cart); assert.equal(d.get('payment-link').focused, 1);
  view.render({ ...state, payment: { status: 'uncertain' } }, shipping, cart);
  assert.equal(d.get('payment-link').hidden, true); assert.equal(d.get('payment-start').hidden, true);
  assert.match(d.get('payment-message').textContent, /incierto/);
  assert.equal(d.get('form').hidden, false); assert.doesNotMatch(d.get('order').className, /checkout-success/);
  view.render({ ...state, payment: { status: 'review' }, order: { ...state.order!, paymentStatus: 'approved' } }, shipping, cart);
  assert.equal(d.get('form').hidden, false); assert.doesNotMatch(d.get('order').className, /checkout-success/);
  assert.equal(d.get('new-order').hidden, true); assert.equal(d.get('payment-start').hidden, true);
  assert.match(d.get('payment-message').textContent, /No vuelvas a pagar/);
  view.render({ ...state, payment: { status: 'approved' } }, shipping, cart);
  assert.match(d.get('payment-message').textContent, /verificado/); assert.equal(d.get('payment-link').hidden, true);
  view.dispose();
});

test('new purchase is explicit, unavailable for pending payments and resets the private draft only on success', () => {
  const d = dom(), view = createCheckoutView(d.root);
  let allowed = false, calls = 0;
  view.bind({ setContact() {}, setAddress() {}, placeOrder() {}, requestQuote() {}, findDestination() {}, setPostalCode() {}, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {},
    startNewOrder() { calls++; return allowed; } });
  const state: CheckoutSnapshot = { ...snapshot(), locked: true, order: { id: 'order', testLocal: true, orderStatus: 'received', paymentStatus: 'pending', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', currency: 'ARS', totalMinor: '100', paymentAvailable: true } };
  view.render(state, shipping, cart);
  assert.equal(d.get('new-order').hidden, true); assert.equal(d.get('new-order').disabled, true);
  d.get('new-order').dispatchEvent(new Event('click')); assert.equal(calls, 0);
  view.render({ ...state, order: { ...state.order!, paymentStatus: 'rejected' } }, shipping, cart);
  assert.equal(d.get('new-order').hidden, true);
  view.render({ ...state, payment: { status: 'expired' } }, shipping, cart);
  assert.equal(d.get('new-order').hidden, false);
  d.get('name').value = 'Private draft';
  d.get('new-order').dispatchEvent(new Event('click'));
  assert.equal(d.get('name').value, 'Private draft'); assert.equal(calls, 1);
  allowed = true; d.get('new-order').dispatchEvent(new Event('click'));
  assert.equal(d.get('name').value, ''); assert.equal(d.get('name').focused, 1); assert.equal(calls, 2);
  view.dispose();
});

test('checkout renderer retains native inputs/options and uses text for untrusted catalog data', () => {
  const d = dom(), view = createCheckoutView(d.root, () => true), state = snapshot();
  view.render(state, shipping, cart); const field = d.get('name'), radio = d.get('options').children[0].children[0];
  assert.equal(field.value, 'Private'); assert.equal(d.get('submit').disabled, false); assert.equal(d.get('form').hidden, false);
  assert.match(d.get('options').children[0].children[1].textContent, /<img src=x>/);
  view.render({ ...state, contact: { ...state.contact, name: 'Typed' } }, shipping, cart);
  assert.equal(d.get('name'), field); assert.equal(field.value, 'Typed'); assert.equal(d.get('options').children[0].children[0], radio);
  assert.match(d.get('lines').children[0].textContent, /<img src=x>/); view.dispose();
});
test('checkout totals/submit require coherent single currency, quote TTL and pickup membership', () => {
  const d = dom(), view = createCheckoutView(d.root), state = snapshot();
  view.render(state, shipping, { ...cart, totals: { ARS: 100n, USD: 100n } }); assert.equal(d.get('submit').disabled, true); assert.equal(d.get('grand-total').textContent, '');
  view.render(state, shipping, { ...cart, unresolved: true }); assert.equal(d.get('submit').disabled, true);
  const pickup = { ...state, quote: { ...state.quote!, options: [{ ...state.quote!.options[0], pickupPoints: [{ id: 1, description: 'Point' }] }] } };
  view.render({ ...pickup, point: '999' }, shipping, cart); assert.equal(d.get('submit').disabled, true);
  view.render({ ...pickup, point: '1' }, shipping, cart); assert.equal(d.get('submit').disabled, false);
  view.render({ ...state, quote: { ...state.quote!, validUntil: 1 } }, shipping, cart); assert.equal(d.get('submit').disabled, true); view.dispose();
});

test('confirmed test order receives focus once and keeps the form hidden on later updates', () => {
  const d = dom(), view = createCheckoutView(d.root), state = snapshot();
  const completed: CheckoutSnapshot = { ...state, locked: true, order: { id: 'test-order', testLocal: true, orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', currency: 'ARS', totalMinor: '200' } };
  view.render(state, shipping, cart); assert.equal(d.get('order').focused, 0);
  view.render(completed, shipping, cart); assert.equal(d.get('order').focused, 1); assert.equal(d.get('form').hidden, true);
  view.render(completed, shipping, cart); assert.equal(d.get('order').focused, 1);
  view.dispose();
});
test('summary retains product/variant/subtotal copy and only includes eligible delivery totals', () => {
  const d = dom(), view = createCheckoutView(d.root), state = snapshot();
  const priced = { ...cart, items: [{ ...cart.items[0], quantity: 2, product: { ...cart.items[0].product!, name: 'Mesa' }, variant: { ...cart.items[0].variant!, name: 'Roble' } }], totals: { ARS: 200n } };
  state.quote = { ...state.quote!, options: [{ ...state.quote!.options[0], amountMinor: '50' }] };
  view.render(state, shipping, priced); assert.match(d.get('lines').children[0].textContent, /Mesa.*Roble/);
  const info = d.get('lines').children[0].children[1];
  assert.equal(info.children[1].textContent, 'Roble');
  assert.equal(info.children[3].children[0].children[1].textContent, '2');
  assert.match(d.get('totals').children[0].textContent, /Subtotal/); assert.match(d.get('grand-total').textContent, /Total estimado:.*2,50/); assert.equal(d.get('submit').disabled, false);
  for (const invalid of [{ ...state, quote: null }, { ...state, expired: true }, { ...state, option: 'missing' }]) {
    view.render(invalid, shipping, priced); assert.equal(d.get('grand-total').textContent, ''); assert.equal(d.get('submit').disabled, true);
  }
  view.render(state, shipping, { ...priced, totals: { ARS: 200n, USD: 100n } }); assert.equal(d.get('grand-total').textContent, ''); assert.equal(d.get('submit').disabled, true); view.dispose();
});
test('postal lookup retains the editor node and ordinary lookup status does not steal critical focus', () => {
  const d = dom(), view = createCheckoutView(d.root), state = { ...snapshot(), quote: null }, postal = d.get('postal');
  view.render(state, { ...shipping, postalCode: '1414', candidateId: null, lookup: { status: 'loading', candidates: [] } }, cart);
  view.render(state, { ...shipping, postalCode: '1414' }, cart);
  assert.equal(d.get('postal'), postal); assert.equal(postal.value, '1414'); assert.equal(d.get('candidates').value, 'city');
  assert.equal(d.get('error').focused, 0); assert.equal(d.get('pending').focused, 0); assert.equal(d.get('delivery').attributes.get('aria-busy'), 'false'); view.dispose();
});
test('pending recovery and critical focus are explicit; reset never appears for uncertain attempts', () => {
  const d = dom(), view = createCheckoutView(d.root, () => false), state = { ...snapshot(), pending: 'key', locked: true, focusRequest: 1 };
  view.render(state, shipping, cart); assert.equal(d.get('check').hidden, false); assert.equal(d.get('retry').hidden, true); assert.equal(d.get('fields').disabled, true);
  assert.equal(d.get('pending').focused, 1); view.render(state, shipping, cart); assert.equal(d.get('pending').focused, 1);
  view.render({ ...state, canRetry: true, sending: true }, shipping, cart); assert.equal(d.get('retry').hidden, false); assert.equal(d.get('retry').disabled, true);
  view.render({ ...snapshot(), error: 'Invalid session', invalidSession: true, focusRequest: 2 }, shipping, cart);
  assert.equal(d.get('reset').hidden, true); assert.equal(d.get('reset-unavailable').hidden, false); assert.equal(d.get('error').focused, 1); view.dispose();
});
test('native submit reads current fields/autofill, validates, prevents navigation and unbinds on dispose', () => {
  const d = dom(), view = createCheckoutView(d.root), calls: unknown[] = [];
  const actions = { setContact: (value: unknown) => calls.push(['contact', value]), setAddress: (value: unknown) => calls.push(['address', value]),
    placeOrder: () => calls.push(['order']), requestQuote: () => calls.push(['quote']), findDestination() {}, setPostalCode() {}, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {} };
  view.bind(actions); view.render(snapshot(), shipping, cart); assert.deepEqual(calls, []);
  d.get('name').value = 'Autofilled'; const submit = new Event('submit', { cancelable: true }); d.get('form').dispatchEvent(submit);
  assert.equal(submit.defaultPrevented, true); assert.deepEqual(calls[0], ['contact', { name: 'Autofilled', email: 'a@example.invalid', phone: '123', document: '' }]); assert.deepEqual(calls.at(-1), ['order']);
  calls.length = 0; d.get('form').validity = false; d.get('form').dispatchEvent(new Event('submit', { cancelable: true })); assert.deepEqual(calls, []);
  view.dispose(); d.get('quote').dispatchEvent(new Event('click')); assert.deepEqual(calls, []);
});
test('native submit snapshots contact and address before synchronous store publications repaint autofill', () => {
  const d = dom(), view = createCheckoutView(d.root); let state = snapshot();
  view.bind({ setContact(value) { state = { ...state, contact: value }; view.render(state, shipping, cart); },
    setAddress(value) { state = { ...state, address: value }; view.render(state, shipping, cart); },
    placeOrder() {}, requestQuote() {}, findDestination() {}, setPostalCode() {}, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {} });
  view.render(state, shipping, cart); d.get('name').value = 'Autofilled contact'; d.get('street').value = 'Autofilled street';
  d.get('form').dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(state.contact.name, 'Autofilled contact'); assert.equal(state.address.street, 'Autofilled street'); view.dispose();
});
test('autofill survives unrelated cart/shipping renders and is captured at explicit submission', () => {
  const d = dom(), view = createCheckoutView(d.root); let state = snapshot(); let orders = 0;
  view.bind({ setContact(value) { state = { ...state, contact: value }; view.render(state, shipping, cart); },
    setAddress(value) { state = { ...state, address: value }; view.render(state, shipping, cart); },
    placeOrder() { orders++; }, requestQuote() {}, findDestination() {}, setPostalCode() {}, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {} });
  view.render(state, shipping, cart);
  const filled = { name: 'Native Name', email: 'native@example.invalid', phone: '555', document: '00123456', street: 'Native Street', number: '42', unit: '3A' };
  for (const [name, value] of Object.entries(filled)) d.get(name).value = value;
  view.render(state, { ...shipping, estimateEnabled: true }, { ...cart, count: 2 });
  for (const [name, value] of Object.entries(filled)) assert.equal(d.get(name).value, value);
  assert.equal(state.contact.name, 'Private', 'an unrelated render does not silently capture native input');
  d.get('form').dispatchEvent(new Event('submit', { cancelable: true }));
  assert.deepEqual(state.contact, { name: filled.name, email: filled.email, phone: filled.phone, document: filled.document });
  assert.deepEqual(state.address, { street: filled.street, number: filled.number, unit: filled.unit }); assert.equal(orders, 1); view.dispose();
});
test('native draft fields are cleared only at the explicit lifecycle reset boundary', () => {
  const d = dom(), view = createCheckoutView(d.root), state = snapshot(); view.render(state, shipping, cart);
  d.get('name').value = 'Native draft'; d.get('unit').value = 'Native unit';
  view.resetDraft();
  for (const name of ['name', 'email', 'phone', 'street', 'number', 'unit']) assert.equal(d.get(name).value, '');
  assert.equal(d.get('postal').value, '1000', 'shared shipping destination is not private contact data'); view.dispose();
});
test('an unreported postal change survives render and is captured before lookup, quote or submit', () => {
  for (const action of ['lookup', 'quote', 'form']) {
    const d = dom(), view = createCheckoutView(d.root), state = snapshot(), calls: unknown[] = [];
    view.bind({ setContact() {}, setAddress() {}, placeOrder() { calls.push('order'); }, requestQuote() { calls.push('quote'); }, findDestination() { calls.push('lookup'); },
      setPostalCode(value) { calls.push(['postal', value]); }, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {} });
    view.render(state, shipping, cart); d.get('postal').value = '2000';
    view.render(state, { ...shipping, estimateEnabled: true }, cart); assert.equal(d.get('postal').value, '2000');
    d.get(action).dispatchEvent(new Event(action === 'form' ? 'submit' : 'click', { cancelable: true }));
    assert.deepEqual(calls[0], ['postal', '2000']); view.dispose();
  }
});
test('lookup captures eventless postal autofill from an initially empty field without another render', () => {
  const d = dom(), view = createCheckoutView(d.root), calls: unknown[] = [];
  view.bind({ setContact() {}, setAddress() {}, placeOrder() {}, requestQuote() {}, findDestination() { calls.push('lookup'); },
    setPostalCode(value) { calls.push(['postal', value]); }, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {} });
  view.render({ ...snapshot(), quote: null, option: '' }, { ...shipping, postalCode: '', candidateId: null, lookup: { status: 'idle', candidates: [] } }, cart);
  d.get('postal').value = '1000';
  d.get('lookup').dispatchEvent(new Event('click'));
  assert.deepEqual(calls, [['postal', '1000'], 'lookup']); view.dispose();
});
test('checkout mount shares the supplied owners, pauses on pagehide and restores without automatic order work', () => {
  const d = dom(), session = new ShippingSession(async () => { throw Error('No automatic network'); });
  const keys = new Map([['checkout-local-pending-v1', 'saved']]);
  const store = createCheckoutStore(session, { runtime: { storage: () => ({ getItem: key => keys.get(key) ?? null, setItem: (key, value) => { keys.set(key, value); }, removeItem: key => { keys.delete(key); } }), now: Date.now, randomUUID: () => 'new', setTimeout: () => null, clearTimeout() {} } });
  const listeners = new Set<() => void>(), lifecycle = new EventTarget(); let closed = 0, locked = false;
  const mount = mountCheckout(d.root, { cart: { getSnapshot: () => cart, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; } }, shippingSession: session, store,
    lifecycle, closeCart: () => { closed++; }, setCartLocked: value => { locked = value; } });
  assert.equal(store.getSnapshot().pending, 'saved'); assert.equal(session.getSnapshot().estimateEnabled, false); assert.equal(locked, true); assert.ok(closed > 0);
  d.get('name').value = 'Unreported private draft';
  lifecycle.dispatchEvent(new Event('pagehide')); assert.equal(store.getSnapshot().loaded, false); assert.equal(session.getSnapshot().estimateEnabled, true); assert.equal(d.get('name').value, '');
  lifecycle.dispatchEvent(new Event('pageshow')); assert.equal(store.getSnapshot().loaded, true); assert.equal(store.getSnapshot().canRetry, false);
  mount.dispose(); assert.equal(listeners.size, 0); assert.equal(locked, false); lifecycle.dispatchEvent(new Event('pageshow')); assert.equal(store.getSnapshot().loaded, false); session.dispose();
});

test('document captures native edits and autofill and is cleared with the private draft', () => {
  const d = dom(), view = createCheckoutView(d.root), captured: unknown[] = [];
  view.bind({ setContact: value => { captured.push(value); }, setAddress() {}, placeOrder() {}, requestQuote() {}, findDestination() {},
    setPostalCode() {}, selectDestination() {}, selectOption() {}, selectPoint() {}, retryAttempt() {}, checkPending() {}, discardSession() {} });
  view.render(snapshot(), shipping, cart);
  d.get('document').value = '00123456'; d.get('document').dispatchEvent(new Event('input'));
  assert.equal((captured.at(-1) as { document: string })?.document, '00123456');
  d.get('document').value = '20123456786'; d.get('form').dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal((captured.at(-1) as { document: string }).document, '20123456786');
  view.resetDraft(); assert.equal(d.get('document').value, ''); view.dispose();
});

test('summary shows safe product thumbnails with a same-size missing/broken image fallback', () => {
  const d = dom(), view = createCheckoutView(d.root);
  const product = { ...cart.items[0].product!, primaryImage: { id: 'image-1', alt: 'Product', width: 500, height: 500 } };
  view.render(snapshot(), shipping, { ...cart, items: [{ ...cart.items[0], product, variant: cart.items[0].variant! }] });
  const media = d.get('lines').children[0].children[0], img = media.children[0] as NodeDouble & { src: string; width: number; height: number; alt: string };
  assert.equal(img.src, '/api/v1/catalog/images/image-1?w=320');
  assert.equal(img.width, 64); assert.equal(img.height, 64); assert.equal(img.alt, '');
  assert.equal(img.hidden, false); assert.equal(media.children[1].hidden, true);
  img.dispatchEvent(new Event('error')); assert.equal(img.hidden, true); assert.equal(media.children[1].hidden, false);
  for (const primaryImage of [null, { ...product.primaryImage, id: '../../private' }]) {
    view.render(snapshot(), shipping, { ...cart, items: [{ ...cart.items[0], product: { ...product, primaryImage }, variant: cart.items[0].variant! }] });
    const missing = d.get('lines').children[0].children[0];
    assert.equal(missing.children[0].hidden, true); assert.equal(missing.children[1].hidden, false);
  }
  view.dispose();
});
