import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { completeCartPurchase, readCartSnapshot, writeCartSnapshot, hasCartSnapshot, withCartLock } from '../../src/presentation/shared/cart/cart-storage';
import { createCartStore } from '../../src/presentation/cart/client/state/cart-store';
import type { CartRuntime } from '../../src/presentation/cart/client/state/cart-runtime';
import type { CartPair, CartResolution } from '../../src/presentation/shared/cart/cart-resolution';
import { createOrder } from '../../src/presentation/shared/checkout/checkout-client';

const key = 'storefront-cart-v1-api';
const line = (productId = 'p', quantity = 1) => ({ productId, variantId: 'v', quantity });
const resolve = async (lines: CartPair[]): Promise<CartResolution> => ({ missing: [], resolved: lines.map(pair => ({ ...pair,
  product: { id: pair.productId, name: 'Product', slug: 'product', description: '', variants: [] },
  variant: { id: pair.variantId, name: 'Variant', priceMinor: 100, currency: 'ARS' },
})) });
function storageFixture(t: TestContext) {
  const values = new Map<string, string>(); let fail: (key: string, value: string) => boolean = () => false;
  for (const name of ['localStorage', 'sessionStorage']) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    const data = name === 'localStorage' ? values : new Map<string, string>();
    Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: (k: string) => data.get(k) ?? null,
      setItem(k: string, value: string) { if (fail(k, value)) throw Error('Storage denied'); data.set(k, value); } } });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name); });
  }
  const listeners = new Set<() => void>();
  const runtime: CartRuntime = { read: readCartSnapshot, write: writeCartSnapshot, has: hasCartSnapshot, completePurchase: completeCartPurchase,
    lock: withCartLock, locksAvailable: () => true, listen(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }, notify() { for (const fn of listeners) fn(); } };
  return { values, runtime, fail: (fn: typeof fail) => { fail = fn; } };
}

test('approved purchase empties bought quantities, updates both badges and preserves extra products across reloads', async t => {
  const f = storageFixture(t); writeCartSnapshot(key, [line('p', 3), line('added', 2)]);
  const a = createCartStore('api', { runtime: f.runtime, resolve }), b = createCartStore('api', { runtime: f.runtime, resolve });
  t.after(a.start()); t.after(b.start());
  await Promise.all([a.completePurchase('order', [line('p', 2)]), b.completePurchase('order', [line('p', 2)])]);
  assert.deepEqual(readCartSnapshot(key)?.lines, [line('p'), line('added', 2)]);
  assert.equal(a.getSnapshot().count, 3); assert.equal(b.getSnapshot().count, 3);
  await a.add('p', 'v');
  const reloaded = createCartStore('api', { runtime: f.runtime, resolve }); t.after(reloaded.start());
  await reloaded.completePurchase('order', [line('p', 2)]);
  assert.equal(reloaded.getSnapshot().count, 4, 'old approval cannot remove a later purchase');
  await reloaded.completePurchase('second-order', [line('p', 2), line('added', 2)]);
  assert.equal(a.getSnapshot().count, 0); assert.equal(b.getSnapshot().count, 0);
  assert.deepEqual(readCartSnapshot(key)?.lines, []);
});

test('a failed completion marker cannot double-subtract after a reload', t => {
  const f = storageFixture(t); writeCartSnapshot(key, [line('p', 4)]);
  f.fail((k, value) => k.includes(':purchase:') && value === 'done');
  assert.deepEqual(completeCartPurchase(key, 'order', [line('p', 2)], 'local')?.lines, [line('p', 2)]);
  assert.deepEqual(completeCartPurchase(key, 'order', [line('p', 2)], 'local')?.lines, [line('p', 2)]);
  writeCartSnapshot(key, [line('p', 5)]);
  assert.deepEqual(completeCartPurchase(key, 'order', [line('p', 2)], 'local')?.lines, [line('p', 5)]);
});

test('storage failures preserve cart data and cannot remove a subsequent cart', t => {
  const f = storageFixture(t);
  for (const failure of ['receipt', 'revision', 'cart']) {
    f.values.clear(); f.fail(() => false); writeCartSnapshot(key, [line('p', 2)]);
    f.fail(k => failure === 'receipt' ? k.includes(':purchase:') : failure === 'revision' ? k.endsWith(':revision') : k === key);
    assert.equal(completeCartPurchase(key, 'order', [line()], 'local'), null);
    assert.deepEqual(readCartSnapshot(key)?.lines, [line('p', 2)]);
    f.fail(() => false);
    if (failure === 'receipt') {
      assert.deepEqual(completeCartPurchase(key, 'order', [line()], 'local')?.lines, [line()]);
    } else {
      writeCartSnapshot(key, [line('p', 3)]);
      assert.deepEqual(completeCartPurchase(key, 'order', [line()], 'local')?.lines, [line('p', 3)]);
    }
  }
});

test('session fallback clears and remembers completion in the same storage area as its cart', async t => {
  const f = storageFixture(t); writeCartSnapshot(key, [line()]);
  const runtime = { ...f.runtime, locksAvailable: () => false };
  const store = createCartStore('api', { runtime, resolve }); t.after(store.start());
  await store.completePurchase('order', [line()]);
  assert.deepEqual(readCartSnapshot(key, 'session')?.lines, []);
  assert.deepEqual(readCartSnapshot(key, 'local')?.lines, [line()]);
  await store.add('p', 'v');
  const reloaded = createCartStore('api', { runtime, resolve }); t.after(reloaded.start());
  await reloaded.completePurchase('order', [line()]); assert.equal(reloaded.getSnapshot().count, 1);
});

test('private checkout responses reject malformed or duplicate purchased quantities', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const order = { id: 'order', orderStatus: 'confirmed', paymentStatus: 'approved', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', testLocal: false, currency: 'ARS', totalMinor: '100' };
  const input = { quoteId: 'quote', optionId: 'option', pickupPointId: null, contact: { name: 'Buyer', email: 'buyer@example.com', phone: '123' }, address: { street: 'Street', number: '1', unit: '' } };
  for (const cartLines of [[], [line('p', 0)], [line('p', -1)], [line('p', 1.5)], [line('p', 1000)], [line(), line()], [{ ...line(), productId: {} }]]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ ...order, cartLines }));
    await assert.rejects(createOrder('csrf', 'key', input), /Invalid purchased items/);
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ ...order, cartLines: [line()] }));
  assert.deepEqual((await createOrder('csrf', 'key', input)).cartLines, [line()]);
});
