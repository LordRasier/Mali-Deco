import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCheckoutStore, type CheckoutTransport, type CheckoutRuntime, type CheckoutShippingPort } from '../../src/presentation/checkout/client/state/checkout-store';
import { CheckoutError, type Quote, type Order } from '../../src/presentation/shared/checkout/checkout-client';
import { ShippingSession, type ShippingSnapshot } from '../../src/presentation/shared/shipping/shipping-session';
import { cartShippingIdentity, shippingPanelState } from '../../src/presentation/shipping/client/state/shipping-presentation';

const lines = [{ productId: 'p', variantId: 'v', quantity: 1 }];

test('quantity updates requote and restore the delivery choice without restoring an old price', async () => {
  let n = 0; const f = fixture({ getQuote: async () => ({ ...quote, quoteId: `q${++n}`, options: [{ ...quote.options[0], id: `o${n}`, amountMinor: String(n * 100) }] }) });
  f.start(); await f.store.requestQuote(); f.store.selectOption('o1');
  f.store.syncCart([{ ...lines[0], quantity: 2 }], true, true, 'ARS:200');
  assert.equal(f.store.getSnapshot().quote, null);
  f.store.syncCart([{ ...lines[0], quantity: 2 }], false, true, 'ARS:200'); await settled();
  assert.equal(f.store.getSnapshot().option, 'o2'); assert.equal(f.store.getSnapshot().quote?.options[0].amountMinor, '200');
  assert.equal(f.calls.some(c => c.name === 'createOrder'), false); f.store.dispose();
});

test('first stock rejection unlocks editing but an uncertain retry remains pending', async () => {
  for (const uncertain of [false, true]) {
    let calls = 0; const f = fixture({ createOrder: async () => { if (uncertain && ++calls === 1) throw Error('network'); throw new CheckoutError(409, 'STOCK_UNAVAILABLE'); } });
    await f.ready(); await f.store.placeOrder(); if (uncertain) await f.store.retryAttempt();
    assert.equal(f.store.getSnapshot().locked, uncertain);
    if (!uncertain) { assert.equal(f.store.getSnapshot().quote, null); assert.match(f.store.getSnapshot().error, /stock/); }
    f.store.dispose();
  }
});

test('an in-flight quantity mutation invalidates submission and retains delivery for its completion', async () => {
  const f = fixture(); await f.ready(); assert.equal(f.store.beginCartEdit(), true);
  await f.store.placeOrder(); assert.equal(f.calls.some(c => c.name === 'createOrder'), false);
  assert.equal(f.store.beginCartEdit(), false); assert.equal(f.store.getSnapshot().locked, true);
  f.store.syncCart([{ ...lines[0], quantity: 2 }], false, true, 'ARS:200');
  assert.equal(f.store.getSnapshot().quote, null); f.store.endCartEdit(); await settled();
  assert.equal(f.store.getSnapshot().locked, false); assert.equal(f.store.getSnapshot().option, 'o'); f.store.dispose();
});
const quote: Quote = { quoteId: 'q', validUntil: 2000, options: [{ id: 'o', carrierName: 'C', serviceName: 'S', serviceCode: 'home', amountMinor: '100', currency: 'ARS' }] };
const order: Order = { id: 'order', totalMinor: '100', currency: 'ARS', orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', testLocal: true };

test('payment-enabled orders retain only their opaque recovery key and payment start is explicit', async () => {
  let starts = 0;
  const f = fixture({ createOrder: async () => ({ ...order, paymentAvailable: true }), startPayment: async () => { starts++; return { status: 'uncertain' }; }, refreshPayment: async () => ({ status: 'approved' }) });
  await f.ready(); await f.store.placeOrder();
  assert.equal(starts, 0); assert.equal(f.storage.get('checkout-local-pending-v1'), 'key');
  await f.store.startPayment(); assert.equal(f.store.getSnapshot().payment?.status, 'uncertain');
  await f.store.refreshPayment(); assert.equal(f.store.getSnapshot().payment?.status, 'approved');
  assert.equal(f.store.getSnapshot().order?.paymentStatus, 'approved');
  assert.deepEqual([...f.storage.values()], ['key']);
  assert.equal(f.calls.filter(call => call.name === 'createOrder').length, 1); f.store.dispose();
});

test('late payment completion cannot publish into a restarted checkout owner', async () => {
  const response = deferred<{ status: 'approved' }>();
  const f = fixture({ createOrder: async () => ({ ...order, paymentAvailable: true }), refreshPayment: () => response.promise });
  await f.ready(); await f.store.placeOrder(); const request = f.store.refreshPayment(); await settled();
  f.store.stop(); f.start(); response.resolve({ status: 'approved' }); await request;
  assert.equal(f.store.getSnapshot().payment, undefined); f.store.dispose();
});
test('a new purchase clears only the resolved attempt and needs a fresh quote and explicit submission', async () => {
  const f = fixture({ createOrder: async () => ({ ...order, paymentAvailable: true }), refreshPayment: async () => ({ status: 'approved' }) });
  await f.ready(); await f.store.placeOrder(); await f.store.refreshPayment();
  assert.equal(f.store.startNewOrder(), true);
  assert.equal(f.store.getSnapshot().order, null); assert.equal(f.store.getSnapshot().quote, null);
  assert.equal(f.store.getSnapshot().payment, undefined); assert.equal(f.store.getSnapshot().paymentFocus, undefined);
  assert.equal(f.store.getSnapshot().locked, false); assert.equal(f.storage.has('checkout-local-pending-v1'), false);
  await f.store.placeOrder(); assert.equal(f.calls.filter(c => c.name === 'createOrder').length, 1);
  f.runtime.randomUUID = () => 'second-key';
  await f.store.requestQuote(); f.store.selectOption('o'); await f.store.placeOrder();
  assert.equal(f.calls.filter(c => c.name === 'createOrder')[1].args[1], 'second-key');
  assert.equal(f.store.getSnapshot().payment, undefined);
  assert.equal(f.calls.some(c => c.name === 'discardInvalidCheckoutSession'), false); f.store.dispose();
});
test('new purchase cannot discard a pending payment, uncertain outcome or another recovery key', async () => {
  for (const status of ['pending', 'uncertain', 'approved'] as const) {
    const f = fixture({ createOrder: async () => ({ ...order, paymentAvailable: true }), refreshPayment: async () => ({ status }) });
    await f.ready(); await f.store.placeOrder(); await f.store.refreshPayment();
    if (status === 'approved') f.storage.set('checkout-local-pending-v1', 'different-key');
    assert.equal(f.store.startNewOrder(), false); assert.equal(f.store.getSnapshot().order?.id, 'order');
    assert.ok(f.storage.has('checkout-local-pending-v1')); f.store.dispose();
  }
});
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture(overrides: Partial<CheckoutTransport> = {}) {
  const calls: { name: string; args: unknown[] }[] = [], storage = new Map<string, string>(), listeners = new Set<() => void>(), timers = new Map<number, () => void>();
  let now = 1000, timer = 0;
  let shipping: ShippingSnapshot = { mode: 'api', cartKey: null, postalCode: '1000', candidateId: 'city', lookup: { status: 'resolved', candidates: [{ id: 'city', label: 'City' }] }, quote: null, selection: null, loading: false, error: false, expired: false, estimateEnabled: true };
  const change = (patch: Partial<ShippingSnapshot>) => { shipping = { ...shipping, ...patch }; for (const fn of listeners) fn(); };
  const port: CheckoutShippingPort = {
    getSnapshot: () => shipping, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setEstimateEnabled: enabled => change({ estimateEnabled: enabled }), syncCart() {},
    setPostalCode: postalCode => change({ postalCode, candidateId: null, lookup: { status: 'idle', candidates: [] } }),
    selectDestination: candidateId => change({ candidateId }), lookup: async () => { calls.push({ name: 'lookup', args: [] }); },
    invalidateDestination: () => change({ candidateId: null, lookup: { status: 'needs_lookup', candidates: [] } }),
  };
  const runtime: CheckoutRuntime = {
    storage: () => ({ getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); }, removeItem: k => { storage.delete(k); } }),
    now: () => now, randomUUID: () => 'key', setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => { timers.delete(id as number); },
  };
  const transport: CheckoutTransport = {
    checkoutSession: async () => 'original', resetCheckoutSession() {}, checkoutRecoveryAvailable: () => true,
    discardInvalidCheckoutSession: async () => {}, getQuote: async () => quote, createOrder: async () => order,
    resumeCheckoutSession: async () => 'resumed', checkOrderAttempt: async () => ({ status: 'unknown' }), ...overrides,
  };
  for (const key of Object.keys(transport) as (keyof CheckoutTransport)[]) {
    const fn = transport[key];
    (transport as Record<string, unknown>)[key] = (...args: unknown[]) => { calls.push({ name: key, args }); return (fn as (...values: unknown[]) => unknown)(...args); };
  }
  const store = createCheckoutStore(port, { runtime, transport });
  const start = () => { const stop = store.start(); store.syncCart(lines, false, true, 'ARS:100'); return stop; };
  const ready = async () => { start(); await store.requestQuote(); store.selectOption('o'); };
  return { store, start, ready, calls, storage, runtime, transport, change, timers, advance(value: number) { now = value; for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

test('construction and server snapshots are stable and side-effect free', () => {
  const f = fixture(); assert.equal(f.store.getSnapshot(), f.store.getSnapshot()); assert.equal(f.store.getServerSnapshot(), f.store.getSnapshot());
  assert.deepEqual(f.calls, []); assert.equal(f.store.getSnapshot().loaded, false);
  f.start(); assert.equal(f.store.getServerSnapshot().loaded, false); assert.equal(f.store.getSnapshot().loaded, true); f.store.dispose();
});

test('explicit quoting is bound to cart, validated destination and TTL', async () => {
  const f = fixture(); await f.ready(); assert.equal(f.store.getSnapshot().quote?.quoteId, 'q');
  f.advance(2000); assert.equal(f.store.getSnapshot().expired, true); await f.store.placeOrder(); assert.equal(f.calls.filter(c => c.name === 'createOrder').length, 0);
  f.store.dispose();
});

test('a cart preference selects only a fresh quoted option and never automatically sends an order', async () => {
  const f = fixture();
  f.storage.set('checkout-delivery-preference-v1', JSON.stringify({ linesKey: JSON.stringify(lines.map(line => [line.productId, line.variantId, line.quantity])), postalCode: '1000', candidateId: 'city', carrierName: 'C', serviceName: 'S', serviceCode: 'home', currency: 'ARS', pointId: null, validUntil: 2000 }));
  f.start(); await settled();
  assert.equal(f.store.getSnapshot().option, 'o'); assert.equal(f.store.getSnapshot().quote?.options[0].amountMinor, '100');
  assert.equal(f.storage.has('checkout-delivery-preference-v1'), false);
  assert.equal(f.calls.some(call => call.name === 'createOrder'), false); f.store.dispose();
});

test('cart changes and destination changes discard late quotes without session mutation', async () => {
  for (const change of ['cart', 'destination']) {
    const result = deferred<Quote>(); const f = fixture({ getQuote: () => result.promise }); f.start();
    const pending = f.store.requestQuote(); await Promise.resolve();
    if (change === 'cart') f.store.syncCart([{ ...lines[0], quantity: 2 }], false, true); else f.change({ postalCode: '1001' });
    result.reject(new CheckoutError(403, 'CHECKOUT_SESSION_INVALID')); await pending;
    assert.equal(f.store.getSnapshot().quote, null); assert.equal(f.store.getSnapshot().error, ''); assert.equal(f.calls.some(c => c.name === 'resetCheckoutSession'), false); f.store.dispose();
  }
});

test('uncertain attempts retain the exact key, original CSRF and frozen input across explicit retries', async () => {
  let count = 0; const f = fixture({ createOrder: async () => { if (++count === 1) throw new Error('network'); throw new CheckoutError(409, 'QUOTE_CHANGED'); } });
  await f.ready(); f.store.setContact({ name: 'Private', email: 'private@example.test', phone: '123' }); f.store.setAddress({ street: 'Private Street', number: '42', unit: 'Unit' }); await f.store.placeOrder();
  assert.equal(f.store.getSnapshot().pending, 'key'); assert.equal(f.store.getSnapshot().canRetry, true);
  for (const secret of ['Private', 'example.test', '123', 'Street', 'Unit']) assert.equal(JSON.stringify([...f.storage]).includes(secret), false);
  assert.equal(f.store.getSnapshot().focusRequest, 1); f.store.setContact({ name: 'Changed', email: '', phone: '' });
  f.store.syncCart([{ ...lines[0], quantity: 2 }], false, true, 'ARS:200'); f.change({ postalCode: '2000' });
  await f.store.retryAttempt(); const sends = f.calls.filter(c => c.name === 'createOrder'); assert.deepEqual(sends[1].args, sends[0].args);
  assert.equal(f.calls.filter(c => c.name === 'checkoutSession').length, 2); assert.equal(f.store.getSnapshot().pending, 'key'); assert.equal(f.store.getSnapshot().focusRequest, 2);
  f.store.dispose();
});

test('first confirmed rejection clears pending; retry rejection never does', async () => {
  for (const error of [new CheckoutError(400), new CheckoutError(409, 'QUOTE_CHANGED')]) {
    const f = fixture({ createOrder: async () => { throw error; } }); await f.ready(); await f.store.placeOrder();
    assert.equal(f.store.getSnapshot().pending, null); assert.equal(f.storage.size, 0);
    if (error.status === 409) assert.equal(f.store.getSnapshot().quote, null); f.store.dispose();
  }
});

test('restored attempt only resumes then looks up; unknown/failed resume remain pending', async () => {
  const f = fixture(); f.storage.set('checkout-local-pending-v1', 'saved'); f.start();
  assert.equal(f.store.getSnapshot().canRetry, false); assert.equal(f.calls.length, 0); assert.equal(f.store.getSnapshot().focusRequest, 1);
  await f.store.retryAttempt(); await f.store.requestQuote(); await f.store.discardSession(); assert.equal(f.calls.length, 0);
  await f.store.checkPending(); assert.deepEqual(f.calls.map(c => c.name), ['resumeCheckoutSession', 'checkOrderAttempt']);
  assert.equal(f.store.getSnapshot().pending, 'saved'); assert.equal(f.store.getSnapshot().focusRequest, 2); assert.equal(f.store.getSnapshot().order, null); f.store.dispose();
  const failed = fixture({ resumeCheckoutSession: async () => { throw new CheckoutError(403); } }); failed.storage.set('checkout-local-pending-v1', 'saved'); failed.start(); await failed.store.checkPending();
  assert.deepEqual(failed.calls.map(c => c.name), ['resumeCheckoutSession']); assert.equal(failed.storage.size, 1); assert.equal(failed.store.getSnapshot().order, null); assert.equal(failed.store.getSnapshot().focusRequest, 2); failed.store.dispose();
});

test('stopping drops private input, ignores late order results and never resends after restart', async () => {
  const result = deferred<Order>(); const f = fixture({ createOrder: () => result.promise }); await f.ready();
  const sending = f.store.placeOrder(); await Promise.resolve(); f.store.stop(); const cleanup = f.store.start();
  result.resolve(order); await sending; assert.equal(f.store.getSnapshot().order, null); assert.equal(f.store.getSnapshot().pending, 'key'); assert.equal(f.store.getSnapshot().canRetry, false); assert.equal(f.storage.size, 1);
  assert.equal(f.calls.filter(c => c.name === 'createOrder').length, 1); cleanup(); f.store.dispose();
});

test('stop during bootstrap prevents a late request from sending and old cleanup cannot stop new lifecycle', async () => {
  const bootstrap = deferred<string>(); const f = fixture({ checkoutSession: () => bootstrap.promise }); const stop = f.start();
  const quoting = f.store.requestQuote(); stop(); f.start(); stop(); bootstrap.resolve('old'); await quoting;
  assert.equal(f.calls.some(c => c.name === 'getQuote'), false); assert.equal(f.store.getSnapshot().quoteBusy, false);
  await f.store.requestQuote(); assert.equal(f.store.getSnapshot().quote?.quoteId, 'q'); f.store.dispose();
});

test('unavailable storage prevents order creation, and completed lookup survives storage removal failure', async () => {
  const f = fixture(); await f.ready(); f.runtime.storage = () => { throw new Error('blocked'); }; await f.store.placeOrder();
  assert.equal(f.calls.some(c => c.name === 'createOrder'), false); assert.equal(f.store.getSnapshot().pending, null); f.store.dispose();
  const g = fixture({ checkOrderAttempt: async () => ({ status: 'completed', order }) }); g.storage.set('checkout-local-pending-v1', 'saved'); g.start();
  g.runtime.storage = () => { throw new Error('blocked'); }; await g.store.checkPending(); assert.equal(g.store.getSnapshot().order?.id, 'order'); assert.equal(g.store.getSnapshot().pending, null); g.store.dispose();
});

test('reset requires verified invalid session, recovery support, and no pending attempt', async () => {
  const f = fixture({ checkoutSession: async () => { throw new CheckoutError(403, 'CHECKOUT_SESSION_INVALID'); } }); f.start();
  await f.store.discardSession(); assert.equal(f.calls.length, 0); await f.store.requestQuote(); assert.equal(f.store.getSnapshot().invalidSession, true);
  await f.store.discardSession(); assert.equal(f.store.getSnapshot().invalidSession, false); assert.equal(f.calls.filter(c => c.name === 'discardInvalidCheckoutSession').length, 1); f.store.dispose();
});

test('synchronous pending subscribers cannot start a duplicate send', async () => {
  const result = deferred<Order>(); const f = fixture({ createOrder: () => result.promise }); await f.ready();
  const unlisten = f.store.subscribe(() => { if (f.store.getSnapshot().canRetry && !f.store.getSnapshot().sending) void f.store.retryAttempt(); });
  const sending = f.store.placeOrder(); await Promise.resolve();
  assert.equal(f.calls.filter(c => c.name === 'createOrder').length, 1); unlisten(); result.resolve(order); await sending; f.store.dispose();
});

test('reset remains a barrier after stop/start until its original request settles', async () => {
  const result = deferred<void>(); let invalid = true;
  const f = fixture({ checkoutSession: async () => { if (invalid) throw new CheckoutError(403, 'CHECKOUT_SESSION_INVALID'); return 'new'; }, discardInvalidCheckoutSession: () => result.promise });
  f.start(); await f.store.requestQuote(); const reset = f.store.discardSession(); f.store.stop(); f.store.start(); invalid = false;
  assert.equal(f.store.getSnapshot().quoteBusy, true); await f.store.requestQuote();
  assert.equal(f.calls.filter(c => c.name === 'checkoutSession').length, 1);
  result.resolve(); await reset; assert.equal(f.store.getSnapshot().quoteBusy, false); assert.equal(f.store.getSnapshot().error, '');
  await f.store.requestQuote(); assert.equal(f.store.getSnapshot().quote?.quoteId, 'q'); f.store.dispose();
});

test('stopping during reset publication releases the barrier before any request starts', async () => {
  for (const restartImmediately of [false, true]) {
    const f = fixture({ checkoutSession: async () => { throw new CheckoutError(403, 'CHECKOUT_SESSION_INVALID'); } });
    f.start(); await f.store.requestQuote();
    let interrupted = false;
    const unsubscribe = f.store.subscribe(() => {
      if (!interrupted && f.store.getSnapshot().quoteBusy) {
        interrupted = true; f.store.stop(); if (restartImmediately) f.store.start();
      }
    });
    await f.store.discardSession(); unsubscribe();
    if (!restartImmediately) f.store.start();
    assert.equal(f.calls.some(c => c.name === 'discardInvalidCheckoutSession'), false);
    assert.equal(f.store.getSnapshot().quoteBusy, false);
    await f.store.discardSession();
    assert.equal(f.calls.filter(c => c.name === 'discardInvalidCheckoutSession').length, 1);
    f.store.dispose();
  }
});

test('stopped resume cannot issue lookup or erase a restarted pending attempt', async () => {
  const result = deferred<string>(); const f = fixture({ resumeCheckoutSession: () => result.promise }); f.storage.set('checkout-local-pending-v1', 'saved'); f.start();
  const checking = f.store.checkPending(); f.store.stop(); f.store.start(); result.resolve('old'); await checking;
  assert.equal(f.calls.some(c => c.name === 'checkOrderAttempt'), false); assert.equal(f.store.getSnapshot().pending, 'saved'); assert.equal(f.storage.size, 1); f.store.dispose();
});

test('stopped order bootstrap cannot send after restart and pending identity stays recoverable', async () => {
  const result = deferred<string>(); let count = 0; const f = fixture({ checkoutSession: async () => ++count === 1 ? 'quoted' : result.promise }); await f.ready();
  const sending = f.store.placeOrder(); f.store.stop(); f.store.start(); result.resolve('old'); await sending;
  assert.equal(f.calls.some(c => c.name === 'createOrder'), false); assert.equal(f.store.getSnapshot().pending, 'key'); f.store.dispose();
});

test('cart price/coherence changes invalidate quotes even without quantity changes', async () => {
  for (const pending of [true, false]) {
    const f = fixture(); await f.ready(); f.store.syncCart(lines, pending, true, pending ? 'ARS:100' : 'ARS:200');
    assert.equal(f.store.getSnapshot().quote, null); await f.store.placeOrder(); assert.equal(f.calls.some(c => c.name === 'createOrder'), false); f.store.dispose();
  }
});

test('invalid destination requires explicit lookup and session conflict does not permit reset', async () => {
  for (const code of ['INVALID_DESTINATION', 'CHECKOUT_SESSION_CONFLICT']) {
    const f = fixture({ getQuote: async () => { throw new CheckoutError(code === 'INVALID_DESTINATION' ? 400 : 403, code); } }); f.start(); await f.store.requestQuote();
    assert.equal(f.store.getSnapshot().invalidSession, false); await f.store.discardSession();
    assert.equal(f.calls.some(c => ['lookup', 'discardInvalidCheckoutSession'].includes(c.name)), false); assert.equal(f.store.getSnapshot().quoteBusy, false); f.store.dispose();
  }
});

test('newly persisted pending keys prevent stale views from resetting or placing another order', async () => {
  const f = fixture(); await f.ready(); f.storage.set('checkout-local-pending-v1', 'other'); await f.store.placeOrder();
  assert.equal(f.store.getSnapshot().pending, 'other'); assert.equal(f.calls.some(c => c.name === 'createOrder'), false); f.store.dispose();
  const g = fixture({ checkoutSession: async () => { throw new CheckoutError(403, 'CHECKOUT_SESSION_INVALID'); } }); g.start(); await g.store.requestQuote(); g.storage.set('checkout-local-pending-v1', 'other');
  await g.store.discardSession(); assert.equal(g.store.getSnapshot().pending, 'other'); assert.equal(g.calls.some(c => c.name === 'discardInvalidCheckoutSession'), false); g.store.dispose();
});

test('pickup membership and failed storage initialization gate order creation', async () => {
  const f = fixture({ getQuote: async () => ({ ...quote, options: [{ ...quote.options[0], pickupPoints: [{ id: 1, description: 'Point' }] }] }) }); await f.ready();
  f.store.selectPoint('999'); await f.store.placeOrder(); assert.equal(f.calls.some(c => c.name === 'createOrder'), false);
  f.store.selectPoint('1'); await f.store.placeOrder(); assert.equal(f.store.getSnapshot().order?.id, 'order'); f.store.dispose();
  const g = fixture(); g.runtime.storage = () => { throw new Error('blocked'); }; g.start(); assert.match(g.store.getSnapshot().error, /almacenamiento/); assert.equal(g.store.getSnapshot().focusRequest, 1); g.store.dispose();
});

test('checkout inherits an ambiguous shared destination without lookup/estimate loops, and evicts it only on explicit server rejection', async () => {
  const a = { id: 'A'.repeat(24), label: 'Locality A' }, b = { id: 'B'.repeat(24), label: 'Locality B' }, shippingCalls: string[] = [];
  const shared = new ShippingSession(async input => { shippingCalls.push(String(input)); return new Response(JSON.stringify({ status: 'ambiguous', candidates: [a, b] }), { status: 200 }); });
  const cart = { items: lines.map(line => ({ ...line, product: null, variant: null })), totals: { ARS: 100n }, unresolved: false };
  const identity = cartShippingIdentity(cart, 'api'), late = deferred<Quote>(); let rejectDestination = false;
  const f = fixture({ getQuote: async () => { if (rejectDestination) throw new CheckoutError(400, 'INVALID_DESTINATION'); return late.promise; } });
  const store = createCheckoutStore(shared, { runtime: f.runtime, transport: f.transport });
  try {
    shared.syncCart('api', identity.lines, false, identity.totalsKey); shared.setPostalCode('7600'); await shared.lookup(); shared.selectDestination(b.id);
    const priorCalls = shippingCalls.length; store.start(); store.syncCart(identity.lines, false, true, identity.totalsKey);
    assert.equal(shared.getSnapshot().postalCode, '7600'); assert.equal(shared.getSnapshot().candidateId, b.id); assert.deepEqual(shared.getSnapshot().lookup.candidates, [a, b]);
    assert.equal(shippingPanelState(cart, 'api', shared.getSnapshot()).busy, false);
    await new Promise(resolve => setTimeout(resolve, 650)); assert.equal(shippingCalls.length, priorCalls, 'inherited destination must not trigger a lookup or cart estimate');
    const pending = store.requestQuote(); await Promise.resolve(); await Promise.resolve();
    const sent = f.calls.find(call => call.name === 'getQuote')!; assert.deepEqual(sent.args.slice(1, 3), [lines, { postalCode: '7600', candidateId: b.id }]);
    shared.setPostalCode('7601'); late.resolve(quote); await pending; assert.equal(store.getSnapshot().quote, null);
    await shared.lookup(); shared.selectDestination(b.id); rejectDestination = true; const beforeRejection = shippingCalls.length;
    await store.requestQuote(); assert.equal(shared.getSnapshot().postalCode, '7601'); assert.equal(shared.getSnapshot().candidateId, null);
    assert.equal(shared.getSnapshot().lookup.status, 'needs_lookup'); assert.equal(store.getSnapshot().quote, null);
    assert.equal(shippingPanelState(cart, 'api', shared.getSnapshot()).busy, false);
    await new Promise(resolve => setTimeout(resolve, 650)); assert.equal(shippingCalls.length, beforeRejection, 'eviction requires explicit lookup, not an automatic retry');
  } finally { store.dispose(); shared.dispose(); f.store.dispose(); }
});

test('ordinary lookup does not request critical focus; quote failures focus once and reset remains unavailable without locks', async () => {
  const failed = fixture({ getQuote: async () => { throw new CheckoutError(503); } }); failed.start(); failed.store.findDestination();
  assert.equal(failed.store.getSnapshot().focusRequest, 0); await failed.store.requestQuote();
  assert.equal(failed.store.getSnapshot().focusRequest, 1); assert.equal(failed.store.getSnapshot().invalidSession, false); failed.store.dispose();
  const noLocks = fixture({ checkoutRecoveryAvailable: () => false, checkoutSession: async () => { throw new CheckoutError(403, 'CHECKOUT_SESSION_INVALID'); } });
  noLocks.start(); await noLocks.store.requestQuote(); await noLocks.store.discardSession();
  assert.equal(noLocks.store.getSnapshot().invalidSession, true); assert.equal(noLocks.calls.some(call => call.name === 'discardInvalidCheckoutSession'), false); noLocks.store.dispose();
});

test('document stays only in memory and is sent with the selected order without browser persistence', async () => {
  const f = fixture(); await f.ready();
  f.store.setContact({ name: 'Test', email: 'test@example.invalid', phone: '000', document: '00123456' });
  await f.store.placeOrder();
  const send = f.calls.find(call => call.name === 'createOrder')!;
  assert.equal((send.args[2] as { contact: { document: string } }).contact.document, '00123456');
  assert.doesNotMatch(JSON.stringify([...f.storage]), /00123456|document/);
  f.store.stop(); assert.equal(f.store.getSnapshot().contact.document, ''); f.store.dispose();
});

const savedPreference = (extra = {}) => JSON.stringify({ linesKey: JSON.stringify(lines.map(line => [line.productId, line.variantId, line.quantity])), postalCode: '1000', candidateId: 'city', carrierName: 'C', serviceName: 'S', serviceCode: 'home', currency: 'ARS', pointId: null, validUntil: 2000, ...extra });
const settled = () => new Promise<void>(resolve => setImmediate(resolve));

test('entering checkout restores the cart service automatically once after cart and destination verification', async () => {
  const f = fixture(); f.storage.set('checkout-delivery-preference-v1', savedPreference());
  f.change({ candidateId: null, lookup: { status: 'loading', candidates: [] } });
  f.start(); await settled(); assert.equal(f.calls.length, 0);
  f.change({ candidateId: 'city', lookup: { status: 'resolved', candidates: [{ id: 'city', label: 'City' }] } });
  await settled();
  assert.equal(f.store.getSnapshot().option, 'o');
  assert.equal(f.calls.filter(call => call.name === 'getQuote').length, 1);
  f.store.syncCart(lines, false, true, 'ARS:100'); f.change({ estimateEnabled: false }); await settled();
  assert.equal(f.calls.filter(call => call.name === 'getQuote').length, 1);
  assert.equal(f.calls.some(call => call.name === 'createOrder'), false); f.store.dispose();
});

test('automatic restore waits for cart resolution and restores pickup membership from fresh options', async () => {
  const pickup = { ...quote, options: [{ ...quote.options[0], id: 'fresh-pickup', serviceCode: 'pickup_point', pickupPoints: [{ id: 42, description: 'Point' }] }] };
  const f = fixture({ getQuote: async () => pickup });
  f.storage.set('checkout-delivery-preference-v1', savedPreference({ serviceCode: 'pickup_point', pointId: 42 }));
  f.store.start(); f.store.syncCart(lines, true, true); await settled(); assert.equal(f.calls.length, 0);
  f.store.syncCart(lines, false, true); await settled();
  assert.equal(f.store.getSnapshot().option, 'fresh-pickup'); assert.equal(f.store.getSnapshot().point, '42'); f.store.dispose();
});

test('missing, stale, forged, wrong-destination/cart preferences and pending attempts never auto-quote', async () => {
  for (const raw of [null, 'bad', savedPreference({ validUntil: 999 }), savedPreference({ postalCode: '9999' }), savedPreference({ linesKey: 'different' }), savedPreference({ serviceName: {} })]) {
    const f = fixture(); if (raw) f.storage.set('checkout-delivery-preference-v1', raw);
    f.start(); await settled(); assert.equal(f.calls.length, 0); f.store.dispose();
  }
  const f = fixture(); f.storage.set('checkout-delivery-preference-v1', savedPreference()); f.storage.set('checkout-local-pending-v1', 'uncertain');
  f.start(); await settled(); assert.equal(f.calls.length, 0); f.store.dispose();
});

test('automatic restore errors require explicit retry and late results never select a changed destination', async () => {
  const f = fixture({ getQuote: async () => { throw Error('offline'); } }); f.storage.set('checkout-delivery-preference-v1', savedPreference());
  f.start(); await settled(); assert.ok(f.store.getSnapshot().error);
  f.change({ estimateEnabled: false }); f.store.syncCart(lines, false, true, 'ARS:100'); await settled();
  assert.equal(f.calls.filter(call => call.name === 'getQuote').length, 1);
  await f.store.requestQuote(); assert.equal(f.calls.filter(call => call.name === 'getQuote').length, 2); f.store.dispose();
  const result = deferred<Quote>(), g = fixture({ getQuote: () => result.promise }); g.storage.set('checkout-delivery-preference-v1', savedPreference());
  g.start(); await settled(); g.store.setPostalCode('2000'); result.resolve(quote); await settled();
  assert.equal(g.store.getSnapshot().quote, null); assert.equal(g.store.getSnapshot().option, ''); g.store.dispose();
});

test('choosing the restored ambiguous locality through the UI does not cancel automatic delivery restoration', async () => {
  const f = fixture(); f.storage.set('checkout-delivery-preference-v1', savedPreference());
  f.change({ candidateId: null, lookup: { status: 'ambiguous', candidates: [{ id: 'city', label: 'City' }] } });
  f.start(); f.store.selectDestination('city'); await settled();
  assert.equal(f.calls.filter(call => call.name === 'getQuote').length, 1);
  assert.equal(f.store.getSnapshot().option, 'o'); f.store.dispose();
});
