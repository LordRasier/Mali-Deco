/* global require, __dirname, Response, EventTarget, URL, Event, console, process */
/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS probe loads TS hooks through tsx. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { hookRunner } = require('./hook-runner.cjs');
const root = path.join(__dirname, '../../..');
const req = createRequire(path.join(root, 'apps/web/package.json'));
req('tsx/cjs');
const React = req('react');
const { useProductRoute } = require(path.join(root, 'apps/web/src/hooks/useProductRoute.ts'));
const { useCart } = require(path.join(root, 'apps/web/src/hooks/useCart.ts'));
const rawVariant = (id, currency = 'ARS') => ({ id, name: id, priceMinor: 100, currency, supplyMode: 'stock', material: null, color: null });
const id = value => `v${String(value).padStart(3, '0')}`;
const initial = { id: 'p1', slug: 'p1', name: 'P1', description: '', variants: Array.from({ length: 100 }, (_, index) => rawVariant(id(index + 1))) };
const json = value => new Response(JSON.stringify(value), { status: 200 });
let events;
let storage;
let tabStorage;
const active = [];

function browser(url) {
  let queue = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, task) { const next = queue.then(task); queue = next.catch(() => {}); return next; } } } });
  events = new EventTarget();
  const values = new Map();
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const tabValues = new Map();
  tabStorage = { getItem: key => tabValues.get(key) ?? null, setItem: (key, value) => tabValues.set(key, value) };
  const window = {
    location: new URL(url), localStorage: storage,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
  };
  window.history = { pushState(_state, _unused, relative) { window.location = new URL(relative, window.location); } };
  globalThis.window = window;
  globalThis.localStorage = storage;
  globalThis.sessionStorage = tabStorage;
}
function mounted(renderHook) { const runner = hookRunner(React, renderHook); active.push(runner); return runner; }
function resolved(lines) {
  return { resolved: lines.map(pair => ({ ...pair, product: { id: pair.productId, slug: pair.productId, name: pair.productId, description: '' }, variant: rawVariant(pair.variantId, pair.productId === 'p2' ? 'USD' : 'ARS') })), missing: [] };
}

async function main() {
  browser('http://review.invalid/productos/p1?variant=v101');
  let release;
  let pairCalls = 0;
  globalThis.fetch = async (_input, options) => {
    pairCalls++;
    return new Promise(resolve => { release = () => resolve(json(resolved(JSON.parse(options.body).lines))); });
  };
  const stale = mounted(() => useProductRoute(initial, 200, 'api'));
  await stale.settle();
  assert.equal(pairCalls, 1);
  stale.output.choose('v002');
  await stale.settle();
  assert.equal(stale.output.selected.id, 'v002');
  release();
  await stale.settle();
  assert.equal(stale.output.selected.id, 'v002');
  stale.unmount();
  console.log('PASS actual product hook ignores a late off-page selection response after another variant is chosen; one pair lookup, no full scan');

  browser('http://review.invalid/productos/p1');
  globalThis.fetch = async () => json({ ...initial, productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, page: 2, limit: 100, total: 200, variants: Array.from({ length: 100 }, (_, index) => rawVariant(id(index + 100))) });
  const overlap = mounted(() => useProductRoute(initial, 200, 'api'));
  await overlap.settle();
  await overlap.output.loadMore();
  await overlap.settle();
  assert.equal(overlap.output.variants.length, 100);
  assert.equal(overlap.output.hasMore, true);
  assert.equal(overlap.output.pageError, true);
  overlap.unmount();
  console.log('PASS overlapping pages are rejected without advancing the cursor');

  browser('http://review.invalid/productos/p1');
  let tries = 0;
  globalThis.fetch = async () => {
    if (++tries === 1) throw new Error('temporary outage');
    return json({ ...initial, productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, page: 2, limit: 100, total: 200, variants: Array.from({ length: 100 }, (_, index) => rawVariant(id(index + 101))) });
  };
  const retryPage = mounted(() => useProductRoute(initial, 200, 'api'));
  await retryPage.settle(); await retryPage.output.loadMore(); await retryPage.settle();
  assert.equal(retryPage.output.pageError, true);
  assert.equal(retryPage.output.pageConflict, false);
  await retryPage.output.loadMore(); await retryPage.settle();
  assert.equal(retryPage.output.pageError, false);
  assert.equal(retryPage.output.variants.length, 200);
  retryPage.unmount();
  console.log('PASS a failed page can be retried without losing selection');
  browser('http://review.invalid/productos/p1');
  let finishPage;
  globalThis.fetch = async () => new Promise(resolve => { finishPage = () => resolve(json({ ...initial, productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, page: 2, limit: 100, total: 200, variants: Array.from({ length: 100 }, (_, index) => rawVariant(id(index + 101))) })); });
  const oldPage = mounted(() => useProductRoute(initial, 200, 'api'));
  await oldPage.settle();
  const pendingPage = oldPage.output.loadMore();
  await oldPage.settle(); oldPage.output.choose('v002'); await oldPage.settle();
  finishPage(); await pendingPage; await oldPage.settle();
  assert.equal(oldPage.output.variants.length, 100);
  assert.equal(oldPage.output.selected.id, 'v002');
  oldPage.unmount();
  console.log('PASS stale variant page cannot overwrite the current selection');
  browser('http://review.invalid/productos/p1?variant=v101');
  globalThis.fetch = async (input, options) => options?.method === 'POST'
    ? json(resolved(JSON.parse(options.body).lines))
    : json({ ...initial, productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, page: 2, limit: 100, total: 200, variants: Array.from({ length: 100 }, (_, index) => rawVariant(id(index + 101))) });
  const offPage = mounted(() => useProductRoute(initial, 200, 'api'));
  await offPage.settle();
  assert.equal(offPage.output.selected.id, 'v101');
  await offPage.output.loadMore(); await offPage.settle();
  assert.equal(offPage.output.pageError, false);
  assert.equal(offPage.output.variants.length, 200);
  assert.equal(offPage.output.selected.id, 'v101');
  offPage.unmount();
  console.log('PASS selected off-page variant is not mistaken for page overlap');
  browser('http://review.invalid/catalogo');
  const key = 'storefront-cart-v1-api';
  const one = [{ productId: 'p1', variantId: 'v001', quantity: 1 }];
  storage.setItem(key, JSON.stringify(one));
  globalThis.fetch = async (_input, options) => json(resolved(JSON.parse(options.body).lines));
  const cart = mounted(() => useCart('api'));
  await cart.settle();
  assert.equal(cart.output.count, 1);
  const two = [...one, { productId: 'p2', variantId: 'v002', quantity: 1 }];
  storage.setItem(key, JSON.stringify(two)); // A later document adds the second product while this document is preserved.
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  events.dispatchEvent(restored);
  await cart.settle();
  assert.equal(cart.output.count, 2);
  assert.equal(JSON.parse(storage.getItem(key)).length, 2);
  cart.output.adjust('p1', 'v001', 1);
  await cart.settle();
  assert.equal(JSON.parse(storage.getItem(key)).length, 2);
  assert.equal(JSON.parse(storage.getItem(key))[0].quantity, 2);
  cart.unmount();
  console.log('PASS pageshow refresh preserves the other product and updates its quantity');

  browser('http://review.invalid/catalogo');
  storage.setItem(key, JSON.stringify(one));
  globalThis.fetch = async (_input, options) => json(resolved(JSON.parse(options.body).lines));
  const firstDocument = mounted(() => useCart('api'));
  const secondDocument = mounted(() => useCart('api'));
  await firstDocument.settle(); await secondDocument.settle();
  secondDocument.output.add('p2', 'v002');
  await secondDocument.settle();
  assert.equal(JSON.parse(storage.getItem(key)).length, 2);
  events.dispatchEvent(new Event('storage'));
  await firstDocument.settle();
  firstDocument.output.adjust('p1', 'v001', 1);
  await firstDocument.settle();
  assert.equal(JSON.parse(storage.getItem(key)).length, 2);
  // A stale view must not resurrect a line that the other instance removed.
  firstDocument.output.adjust('p1', 'v001', -2);
  await firstDocument.settle();
  secondDocument.output.adjust('p1', 'v001', 1);
  await secondDocument.settle();
  assert.deepEqual(JSON.parse(storage.getItem(key)), [{ productId: 'p2', variantId: 'v002', quantity: 1 }]);
  firstDocument.unmount(); secondDocument.unmount();
  console.log('PASS two mounted carts preserve products from both instances');

  browser('http://review.invalid/catalogo');
  storage.setItem(key, JSON.stringify(one));
  let finishOld;
  let calls = 0;
  globalThis.fetch = async (_input, options) => {
    const lines = JSON.parse(options.body).lines;
    if (++calls === 1) return new Promise(resolve => { finishOld = () => resolve(json({ resolved: [], missing: lines })); });
    return json(resolved(lines));
  };
  const slow = mounted(() => useCart('api'));
  await slow.settle();
  const fast = mounted(() => useCart('api'));
  await fast.settle();
  fast.output.add('p2', 'v002'); await fast.settle();
  finishOld(); await slow.settle(); await fast.settle();
  assert.deepEqual(JSON.parse(storage.getItem(key)), two);
  slow.unmount(); fast.unmount();
  console.log('PASS stale missing response cannot remove another instance changes');
  browser('http://review.invalid/catalogo');
  storage.setItem(key, JSON.stringify(one));
  let finishRemoved;
  let requests = 0;
  globalThis.fetch = async (_input, options) => {
    const lines = JSON.parse(options.body).lines;
    if (++requests === 1) return new Promise(resolve => { finishRemoved = () => resolve(json({ resolved: [], missing: lines })); });
    return json(resolved(lines));
  };
  const oldView = mounted(() => useCart('api'));
  await oldView.settle();
  const newView = mounted(() => useCart('api'));
  await newView.settle();
  newView.output.adjust('p1', 'v001', -1); await newView.settle();
  newView.output.add('p1', 'v001'); await newView.settle();
  finishRemoved(); await oldView.settle(); await newView.settle();
  assert.deepEqual(JSON.parse(storage.getItem(key)), one);
  oldView.unmount(); newView.unmount();
  console.log('PASS stale missing response cannot remove a deliberately re-added item');

  browser('http://review.invalid/catalogo');
  storage.setItem(key, JSON.stringify(one));
  globalThis.fetch = async (_input, options) => json(resolved(JSON.parse(options.body).lines));
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let queued = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, task) { const next = queued.then(task); queued = next.catch(() => {}); return next; } } } });
  const lockA = mounted(() => useCart('api'));
  const lockB = mounted(() => useCart('api'));
  await lockA.settle(); await lockB.settle();
  lockA.output.adjust('p1', 'v001', 1); lockB.output.add('p2', 'v002');
  await lockA.settle(); await lockB.settle();
  assert.deepEqual(JSON.parse(storage.getItem(key)), [{ productId: 'p1', variantId: 'v001', quantity: 2 }, { productId: 'p2', variantId: 'v002', quantity: 1 }]);
  lockA.unmount(); lockB.unmount();
  if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
  console.log('PASS simultaneous cooperating writes serialize through the shared lock');
  browser('http://review.invalid/catalogo');
  storage.setItem(key, JSON.stringify(one));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const noLocks = mounted(() => useCart('api'));
  await noLocks.settle();
  noLocks.output.adjust('p1', 'v001', -1); await noLocks.settle();
  noLocks.output.add('p2', 'v002'); await noLocks.settle();
  assert.equal(noLocks.output.storageUnavailable, true);
  assert.deepEqual(JSON.parse(storage.getItem(key)), one);
  noLocks.unmount();
  const nextRoute = mounted(() => useCart('api'));
  await nextRoute.settle();
  assert.equal(nextRoute.output.count, 1);
  assert.equal(nextRoute.output.items[0].productId, 'p2');
  nextRoute.output.adjust('p2', 'v002', -1); await nextRoute.settle();
  nextRoute.unmount();
  const emptyRoute = mounted(() => useCart('api'));
  await emptyRoute.settle(); assert.equal(emptyRoute.output.count, 0); emptyRoute.unmount();
  assert.deepEqual(JSON.parse(storage.getItem(key)), one);
  console.log('PASS no-lock cart survives navigation and a saved empty cart does not resurrect');
  browser('http://review.invalid/catalogo');
  storage.setItem(key, JSON.stringify(one));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const tabA = mounted(() => useCart('api'));
  const tabB = mounted(() => useCart('api'));
  await tabA.settle(); await tabB.settle();
  tabA.output.adjust('p1', 'v001', 1); tabB.output.add('p2', 'v002');
  await tabA.settle(); await tabB.settle();
  assert.deepEqual(JSON.parse(tabStorage.getItem(key)), [{ productId: 'p1', variantId: 'v001', quantity: 2 }, { productId: 'p2', variantId: 'v002', quantity: 1 }]);
  assert.deepEqual(JSON.parse(storage.getItem(key)), one);
  tabA.unmount(); tabB.unmount();
  console.log('PASS no-lock instances coordinate within their tab without shared writes');
  browser('http://review.invalid/catalogo');
  storage.getItem = () => { throw new Error('storage denied'); };
  tabStorage.getItem = () => { throw new Error('session storage denied'); };
  tabStorage.setItem = () => { throw new Error('session storage denied'); };
  const transient = mounted(() => useCart('demo'));
  await transient.settle();
  transient.output.add('ondas', 'coral'); await transient.settle();
  assert.equal(transient.output.count, 1);
  assert.equal(transient.output.storageUnavailable, true);
  assert.equal(transient.output.storageTabOnly, false);
  transient.unmount();
  console.log('PASS unavailable storage leaves an explicitly temporary in-memory cart');
  browser('http://review.invalid/productos/p1');
  storage.setItem(key, JSON.stringify(two));
  globalThis.fetch = async (_input, options) => json(resolved(JSON.parse(options.body).lines));
  const currencies = mounted(() => useCart('api'));
  await currencies.settle();
  assert.deepEqual(currencies.output.totals, { ARS: 100n, USD: 100n });
  globalThis.fetch = async () => { throw new Error('controlled local failure'); };
  currencies.output.retry();
  await currencies.settle();
  assert.equal(currencies.output.status, 'error');
  assert.equal(currencies.output.unresolved, true);
  assert.equal(JSON.parse(storage.getItem(key)).length, 2);
  currencies.unmount();
  console.log('PASS actual cart hook separates ARS/USD and preserves both stored rows when authoritative resolution fails');
  console.log('LIMITATION: hook lifecycle is controlled with a dispatcher shim; BFCache eligibility and interactive keyboard/retry require browser verification');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const runner of active) runner.unmount(); });
