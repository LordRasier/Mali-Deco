import test from 'node:test';
import assert from 'node:assert/strict';
import { ShippingSession } from '../../src/presentation/shared/shipping/shipping-session';
import { createShippingLifecycle } from '../../src/presentation/shipping/client/state/shipping-runtime';
import { cartShippingIdentity, shippingPanelState } from '../../src/presentation/shipping/client/state/shipping-presentation';

const postalKey = 'storefront-shipping-postal-code-v1-';
const hintKey = 'storefront-shipping-destination-hint-v1-';
function fixture() {
  const values = new Map<string, string>(), window = new EventTarget(), document = new EventTarget();
  const env = { window, document, storage: () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  }) };
  return { values, env };
}

test('restores mode-scoped postal input and persists only postal/hint, never quotes', () => {
  const f = fixture(); f.values.set(postalKey + 'demo', '7600');
  const session = new ShippingSession(async () => { throw Error('Network prohibited'); });
  session.syncCart('demo', [], false);
  const lifecycle = createShippingLifecycle(session, f.env); const stop = lifecycle.start();
  assert.equal(session.getSnapshot().postalCode, '7600');
  session.setPostalCode('1000'); assert.equal(f.values.get(postalKey + 'demo'), '1000');
  assert.equal(f.values.has(postalKey + 'api'), false);
  assert.deepEqual([...f.values.keys()], [postalKey + 'demo']); stop();
});

test('a restored destination hint must match a freshly verified candidate', async () => {
  const f = fixture(), candidate = { id: 'A'.repeat(24), label: 'Localidad de prueba' };
  f.values.set(postalKey + 'api', '7600');
  f.values.set(hintKey + 'api', JSON.stringify({ postalCode: '7600', candidateId: candidate.id }));
  const session = new ShippingSession(async () => Response.json({ status: 'ambiguous', candidates: [candidate, { id: 'B'.repeat(24), label: 'Otra localidad' }] }));
  session.setEstimateEnabled(false); session.syncCart('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false);
  const lifecycle = createShippingLifecycle(session, f.env); const stop = lifecycle.start();
  assert.equal(session.getSnapshot().candidateId, null);
  await session.lookup(); assert.equal(session.getSnapshot().candidateId, candidate.id);
  session.selectDestination(''); assert.equal(f.values.has(hintKey + 'api'), false); stop();
});

test('mode changes do not carry a postal value or candidate from the preceding mode', () => {
  const f = fixture(); f.values.set(postalKey + 'demo', '7600'); f.values.set(postalKey + 'api', '1000');
  const session = new ShippingSession(async () => { throw Error('Network prohibited'); });
  const lifecycle = createShippingLifecycle(session, f.env); const stop = lifecycle.start();
  session.syncCart('demo', [], false); assert.equal(session.getSnapshot().postalCode, '7600');
  session.syncCart('api', [], false); assert.equal(session.getSnapshot().postalCode, '1000');
  assert.equal(session.getSnapshot().candidateId, null); stop();
});

test('storage denial does not clear the in-memory destination', () => {
  const f = fixture(), session = new ShippingSession(async () => { throw Error('Network prohibited'); });
  session.syncCart('demo', [], false); session.setPostalCode('7600');
  const stop = createShippingLifecycle(session, { ...f.env, storage: () => { throw Error('Denied'); } }).start();
  assert.equal(session.getSnapshot().postalCode, '7600');
  session.setPostalCode('1000'); assert.equal(session.getSnapshot().postalCode, '1000'); stop();
});

test('focus/visibility expiry listeners are detached and reattachment does not duplicate them', () => {
  const f = fixture(), session = new ShippingSession(); let refreshed = 0;
  session.expireIfNeeded = () => { refreshed++; };
  const lifecycle = createShippingLifecycle(session, f.env); const stop = lifecycle.start(); const afterStart = refreshed;
  f.env.window.dispatchEvent(new Event('focus')); f.env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshed, afterStart + 2);
  stop(); f.env.window.dispatchEvent(new Event('focus')); assert.equal(refreshed, afterStart + 2);
  const stopAgain = lifecycle.start(); const afterRestart = refreshed;
  f.env.window.dispatchEvent(new Event('focus')); assert.equal(refreshed, afterRestart + 1); stopAgain();
});

test('cleanup aborts pending lookup and ignores its late response', async () => {
  const f = fixture(); let release!: (response: Response) => void, signal: AbortSignal | undefined;
  const session = new ShippingSession(async (_url, init) => { signal = init?.signal ?? undefined; return new Promise(resolve => { release = resolve; }); });
  session.syncCart('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false);
  const lifecycle = createShippingLifecycle(session, f.env); const stop = lifecycle.start(); session.setPostalCode('7600'); const pending = session.lookup();
  stop(); assert.equal(signal?.aborted, true);
  release(Response.json({ status: 'resolved', candidate: { id: 'A'.repeat(24), label: 'Obsoleta' } })); await pending;
  assert.equal(session.getSnapshot().candidateId, null); assert.equal(session.getSnapshot().lookup.status, 'idle');
});

test('failed writes followed by same-owner resume never reload a stale postal code', () => {
  const f = fixture(); f.values.set(postalKey + 'demo', '7600'); let fail = false;
  const session = new ShippingSession(); session.syncCart('demo', [], false);
  const lifecycle = createShippingLifecycle(session, { ...f.env, storage: () => ({ ...f.env.storage(), setItem: (key, value) => { if (fail) throw Error('Quota'); f.env.storage().setItem(key, value); } }) });
  const stop = lifecycle.start(); fail = true; session.setPostalCode('1000'); stop();
  assert.equal(f.values.get(postalKey + 'demo'), '7600');
  const stopAgain = lifecycle.start(); assert.equal(session.getSnapshot().postalCode, '1000'); stopAgain();
});

test('initial denied storage cannot overwrite live memory when storage later recovers', () => {
  const f = fixture(); f.values.set(postalKey + 'demo', '7600'); let denied = true;
  const session = new ShippingSession(); session.syncCart('demo', [], false); session.setPostalCode('1000');
  const lifecycle = createShippingLifecycle(session, { ...f.env, storage: () => { if (denied) throw Error('Denied'); return f.env.storage(); } });
  const stop = lifecycle.start(); stop(); denied = false;
  const stopAgain = lifecycle.start(); assert.equal(session.getSnapshot().postalCode, '1000'); stopAgain();
});

test('disposing synchronously on resolved lookup publication does not launch a quote', async () => {
  let quotes = 0;
  const session = new ShippingSession(async url => {
    if (url === '/api/v1/shipping/destination') return Response.json({ status: 'resolved', candidate: { id: 'A'.repeat(24), label: 'Localidad' } });
    quotes++; return Response.json({ status: 'unavailable', reason: 'DISABLED' });
  });
  session.syncCart('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false); session.setPostalCode('7600');
  const unsubscribe = session.subscribe(() => { if (session.getSnapshot().lookup.status === 'resolved') session.dispose(); });
  await session.lookup(); unsubscribe(); session.dispose();
  assert.equal(quotes, 0);
});

test('disposing on loading publication prevents even the lookup request from starting', async () => {
  let calls = 0;
  const session = new ShippingSession(async () => { calls++; return Response.json({ status: 'not_found' }); });
  session.syncCart('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false); session.setPostalCode('7600');
  const unsubscribe = session.subscribe(() => { if (session.getSnapshot().lookup.status === 'loading') session.dispose(); });
  await session.lookup(); unsubscribe(); session.dispose(); assert.equal(calls, 0);
});

test('disposed sessions stay inactive until explicitly reactivated', async () => {
  let calls = 0;
  const session = new ShippingSession(async () => { calls++; return Response.json({ status: 'not_found' }); });
  session.dispose(); session.syncCart('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false); session.setPostalCode('7600');
  await session.lookup(); assert.equal(calls, 0);
  session.activate(); await session.lookup(); assert.equal(calls, 1); session.dispose();
});

test('a synchronous restart cannot let the preceding lookup launch its quote', async () => {
  let quotes = 0, restart = true;
  const session = new ShippingSession(async url => {
    if (url === '/api/v1/shipping/destination') return Response.json({ status: 'resolved', candidate: { id: 'A'.repeat(24), label: 'Localidad' } });
    quotes++; return Response.json({ status: 'unavailable', reason: 'DISABLED' });
  });
  session.syncCart('api', [{ productId: 'p1', variantId: 'v1', quantity: 1 }], false); session.setPostalCode('7600');
  const unsubscribe = session.subscribe(() => {
    if (restart && session.getSnapshot().lookup.status === 'resolved') { restart = false; session.dispose(); session.activate(); }
  });
  await session.lookup(); session.dispose(); unsubscribe(); assert.equal(quotes, 0);
});

test('one postal lookup supports debounced cart edits, updated totals and unavailable estimates', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  const candidate = { id: 'A'.repeat(24), label: 'Test destination' };
  const requests: { quantity: number }[][] = [];
  let lookups = 0, fail = false;
  const session = new ShippingSession(async (url, init) => {
    if (url === '/api/v1/shipping/destination') { lookups++; return Response.json({ status: 'resolved', candidate }); }
    assert.equal(url, '/api/v1/shipping/quote');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.destination, { postalCode: '7600', candidateId: candidate.id });
    requests.push(body.lines);
    if (fail) return new Response(null, { status: 503 });
    const units = body.lines.reduce((sum: number, line: { quantity: number }) => sum + line.quantity, 0);
    return Response.json({ status: 'quoted', quotedAt: Date.now(), validUntil: Date.now() + 300000, packageCount: 1,
      options: [{ carrierId: 1, carrierName: 'Synthetic', serviceCode: 'standard_delivery', serviceName: 'Home',
        logisticType: 'carrier_dropoff', amountMinor: String(units * 500), currency: 'ARS' }] });
  });
  t.after(() => session.dispose());
  let cart = { items: [{ productId: 'p1', variantId: 'v1', quantity: 1, product: null, variant: null }], totals: { ARS: 1000n }, unresolved: false };
  const sync = () => { const identity = cartShippingIdentity(cart, 'api'); session.syncCart('api', identity.lines, false, identity.totalsKey); };
  const view = () => shippingPanelState(cart, 'api', session.getSnapshot());
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  sync(); session.setPostalCode('7600');
  t.mock.timers.tick(499); assert.equal(lookups, 0);
  t.mock.timers.tick(1); await settle();
  assert.equal(lookups, 1); assert.equal(requests.length, 1); assert.equal(view().total?.amountMinor, 1500n);

  for (const quantity of [2, 3]) {
    cart = { ...cart, items: [{ ...cart.items[0], quantity }], totals: { ARS: BigInt(quantity) * 1000n } };
    sync(); assert.equal(view().shipping, null); assert.equal(view().total, null);
  }
  assert.equal(view().message, 'Calculando envío…');
  t.mock.timers.tick(499); assert.equal(requests.length, 1);
  t.mock.timers.tick(1); await settle();
  assert.equal(requests.length, 2); assert.equal(requests[1][0].quantity, 3); assert.equal(view().total?.amountMinor, 4500n);

  cart = { ...cart, items: [...cart.items, { productId: 'p2', variantId: 'v2', quantity: 1, product: null, variant: null }], totals: { ARS: 4000n } };
  sync(); t.mock.timers.tick(500); await settle(); assert.equal(view().total?.amountMinor, 6000n);
  cart = { ...cart, items: cart.items.slice(0, 1), totals: { ARS: 3000n } };
  sync(); t.mock.timers.tick(500); await settle(); assert.equal(view().total?.amountMinor, 4500n);
  assert.equal(lookups, 1); assert.equal(session.getSnapshot().postalCode, '7600');

  fail = true; cart = { ...cart, items: [{ ...cart.items[0], quantity: 4 }], totals: { ARS: 4000n } };
  sync(); t.mock.timers.tick(500); await settle();
  assert.equal(session.getSnapshot().error, true); assert.equal(view().shipping, null); assert.equal(view().total, null); assert.equal(view().retry, true);
  const count = requests.length;
  cart = { ...cart, items: [], totals: { ARS: 0n } }; sync(); t.mock.timers.tick(1000); await settle();
  assert.equal(requests.length, count); assert.equal(view().total, null);
});
