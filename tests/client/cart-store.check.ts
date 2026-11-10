import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartStore } from '../../src/presentation/cart/client/state/cart-store';
import type { CartRuntime } from '../../src/presentation/cart/client/state/cart-runtime';
import type { CartLine } from '../../src/presentation/shared/catalog/storefront-types';
import type { CartPair, CartResolution } from '../../src/presentation/shared/cart/cart-resolution';
import type { CartSnapshot } from '../../src/presentation/shared/cart/cart-storage';
import { withCartLock } from '../../src/presentation/shared/cart/cart-storage';

test('real session fallback serializes delayed increases and removals without resurrecting lines', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
  const f = fixture([line('p1'), line('p2')]); f.noLocks();
  let release!: () => void, paused = false;
  const store = createCartStore('api', { runtime: { ...f.runtime, lock: withCartLock }, resolve: async lines => { if (paused && lines.length === 1 && lines[0].productId === 'p1') { paused = false; await new Promise<void>(yes => { release = yes; }); } return resolved(lines); } });
  const stop = store.start(); await tick(); paused = true;
  const increase = store.adjust('p1', 'v1', 1); await tick(); const removal = store.remove('p2', 'v1');
  await tick(); release(); await Promise.all([increase, removal]); await tick();
  assert.deepEqual(store.getSnapshot().items.map(({ productId, quantity }) => [productId, quantity]), [['p1', 2]]);
  stop();
  } finally { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else Reflect.deleteProperty(globalThis, 'navigator'); }
});

const line = (productId = 'p1', quantity = 1): CartLine => ({ productId, variantId: 'v1', quantity });
const resolved = (lines: CartPair[]): CartResolution => ({ missing: [], resolved: lines.map(pair => ({
  productId: pair.productId, variantId: pair.variantId,
  product: { id: pair.productId, slug: pair.productId, name: pair.productId, description: '', variants: [] },
  variant: { id: pair.variantId, name: 'Variant', priceMinor: Number.MAX_SAFE_INTEGER, currency: pair.productId === 'p2' ? 'USD' : 'ARS' },
})) });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('all cart increases use fresh stock, shortages preserve rows and decreases/removal remain possible', async () => {
  const f = fixture([]); let stockQuantity = 2;
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => {
    const value = resolved(lines); value.resolved.forEach(item => { item.variant.supplyMode = 'stock'; item.variant.stockQuantity = stockQuantity; }); return value;
  } });
  const stop = store.start(); await store.addVerified('p1', 'v1'); await store.add('p1', 'v1'); await tick();
  assert.equal(store.getSnapshot().count, 2);
  await assert.rejects(store.addVerified('p1', 'v1'), /disponible/);
  await store.adjust('p1', 'v1', 1); assert.equal(store.getSnapshot().count, 2);
  stockQuantity = 1; store.retry(); await tick();
  assert.equal(store.getSnapshot().items.length, 1); assert.equal(store.getSnapshot().stockShortage, true);
  await store.adjust('p1', 'v1', -1); await tick(); assert.equal(store.getSnapshot().stockShortage, false);
  await store.remove('p1', 'v1'); await tick(); assert.equal(store.getSnapshot().count, 0); stop();
});

test('shared cart advertises pending mutations before fresh stock resolves so checkout cannot submit old quantities', async () => {
  const f = fixture(); let release!: () => void, paused = false;
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => { if (paused) { paused = false; await new Promise<void>(yes => { release = yes; }); } return resolved(lines); } });
  const stop = store.start(); await tick(); paused = true;
  const adding = store.adjust('p1', 'v1', 1); await tick(); assert.equal(store.getSnapshot().unresolved, true);
  assert.equal(store.getSnapshot().count, 1); release(); await adding; await tick(); assert.equal(store.getSnapshot().unresolved, false); assert.equal(store.getSnapshot().count, 2); stop();
});

test('simultaneous additions cannot exceed one remaining unit and made-to-order ignores stored inventory', async () => {
  for (const supplyMode of ['stock', 'made_to_order'] as const) {
    const f = fixture([]), store = createCartStore('api', { runtime: f.runtime, resolve: async lines => {
      const value = resolved(lines); value.resolved.forEach(item => Object.assign(item.variant, { supplyMode, stockQuantity: supplyMode === 'stock' ? 1 : 0 })); return value;
    } });
    const stop = store.start(), attempts = await Promise.allSettled([store.addVerified('p1', 'v1'), store.addVerified('p1', 'v1')]); await tick();
    assert.equal(store.getSnapshot().count, supplyMode === 'stock' ? 1 : 2);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, supplyMode === 'stock' ? 1 : 2); stop();
  }
});

test('verified add resolves the exact pair before changing shared cart and reports authoritative price', async () => {
  const f = fixture([]); let release!: (result: CartResolution) => void;
  const store = createCartStore('api', { runtime: f.runtime, resolve: lines => lines.length ? new Promise(accept => { release = accept; }) : Promise.resolve(resolved(lines)) });
  const stop = store.start(); const pending = store.addVerified('p2', 'v1');
  await tick();
  assert.equal(store.getSnapshot().count, 0);
  release(resolved([{ productId: 'p2', variantId: 'v1' }]));
  const receipt = await pending;
  assert.equal(receipt.variant.currency, 'USD'); assert.equal(store.getSnapshot().count, 1); stop();
});

test('verified add rejects missing variants, network failures, limits and aborted requests without adding', async () => {
  for (const failure of ['missing', 'network', 'limit', 'abort'] as const) {
    const f = fixture(failure === 'limit' ? [line('p1', 999)] : []);
    const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => {
      if (failure === 'network') throw new Error('Sin conexión');
      return failure === 'missing' ? { missing: lines, resolved: [] } : resolved(lines);
    } });
    const stop = store.start(); const controller = new AbortController(); if (failure === 'abort') controller.abort();
    await assert.rejects(store.addVerified('p1', 'v1', controller.signal));
    assert.equal(store.getSnapshot().count, failure === 'limit' ? 999 : 0); stop();
  }
});

function fixture(initial = [line()]) {
  const values = new Map<string, CartSnapshot>();
  let version = 0, locks = true, denied = false;
  const key = 'storefront-cart-v1-api';
  const seed = (lines: CartLine[], area = 'local', storageKey = key) => values.set(`${area}:${storageKey}`, { lines: structuredClone(lines), version: String(++version), removed: 0 });
  seed(initial);
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();
  const runtime: CartRuntime = {
    read: (key, area) => denied ? null : structuredClone(values.get(`${area}:${key}`) ?? { lines: [], version: 'empty', removed: 0 }),
    has: (key, area) => denied ? null : values.has(`${area}:${key}`),
    write: (key, lines, area) => { if (denied) return null; seed(lines, area, key); return runtime.read(key, area); },
    locksAvailable: () => locks,
    lock: (_key, task) => { const next = queue.then(task); queue = next.catch(() => {}); return next; },
    listen: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    notify: () => { for (const listener of listeners) listener(); },
  };
  return { runtime, seed, values, listeners, key, deny: () => { denied = true; }, noLocks: () => { locks = false; } };
}

test('construction and snapshots are SSR-pure and cached until a change', async () => {
  const f = fixture(); let reads = 0;
  const runtime = { ...f.runtime, read: (...args: Parameters<CartRuntime['read']>) => { reads++; return f.runtime.read(...args); } };
  const store = createCartStore('api', { runtime, resolve: async lines => resolved(lines) });
  assert.equal(reads, 0); assert.equal(store.getSnapshot().ready, false);
  assert.equal(store.getSnapshot(), store.getSnapshot());
  const stop = store.start(); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().unresolved, false);
  stop(); assert.equal(f.listeners.size, 0);
});

test('simultaneous stores merge current rows and never resurrect removed lines', async () => {
  const f = fixture(), options = { runtime: f.runtime, resolve: async (lines: CartPair[]) => resolved(lines) };
  const a = createCartStore('api', options), b = createCartStore('api', options);
  const stopA = a.start(), stopB = b.start(); await tick();
  await Promise.all([a.adjust('p1', 'v1', 1), b.add('p2', 'v1')]); await tick();
  assert.equal(a.getSnapshot().count, 3); assert.equal(b.getSnapshot().count, 3);
  await a.remove('p1', 'v1'); await b.adjust('p1', 'v1', 1); await tick();
  assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line('p2')]);
  stopA(); stopB();
});

test('a delayed missing response cannot prune a newer storage revision even without a sync event', async () => {
  const f = fixture(); let finish!: (value: CartResolution) => void; let calls = 0;
  const store = createCartStore('api', { runtime: f.runtime, resolve: lines => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(resolved(lines)) });
  const stop = store.start();
  f.seed([line(), line('p2')]); finish({ resolved: [], missing: [line()] }); await tick();
  assert.equal(store.getSnapshot().count, 2); assert.equal(f.runtime.read(f.key, 'local')?.lines.length, 2);
  stop();
});

test('remove then re-add invalidates a delayed missing response (ABA)', async () => {
  const f = fixture(); let finish!: (value: CartResolution) => void; let calls = 0;
  const store = createCartStore('api', { runtime: f.runtime, resolve: lines => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(resolved(lines)) });
  const stop = store.start(); await store.remove('p1', 'v1'); await store.add('p1', 'v1');
  finish({ resolved: [], missing: [line()] }); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().removedNotice, 0);
  stop();
});

test('a valid complete missing response removes only its matching stored lines', async () => {
  const f = fixture([line(), line('p2')]);
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => ({ ...resolved(lines.filter(l => l.productId !== 'p1')), missing: lines.filter(l => l.productId === 'p1') }) });
  const stop = store.start(); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().removedNotice, 1);
  assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line('p2')]); stop();
});

test('failed resolution retains rows, exact currency totals and explicit retry', async () => {
  const f = fixture([line('p1', 999), line('p2')]); let fail = false;
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => { if (fail) throw Error('offline'); return resolved(lines); } });
  const stop = store.start(); await tick();
  assert.deepEqual(store.getSnapshot().totals, { ARS: 999n * BigInt(Number.MAX_SAFE_INTEGER), USD: BigInt(Number.MAX_SAFE_INTEGER) });
  fail = true; store.retry(); await tick();
  assert.equal(store.getSnapshot().status, 'error'); assert.equal(store.getSnapshot().unresolved, true);
  assert.equal(store.getSnapshot().items.length, 2);
  fail = false; store.retry(); await tick(); assert.equal(store.getSnapshot().status, 'idle'); stop();
});

test('without locks session cart survives navigation including an explicitly empty cart', async () => {
  const f = fixture(); f.noLocks();
  const options = { runtime: f.runtime, resolve: async (lines: CartPair[]) => resolved(lines) };
  const store = createCartStore('api', options); const stop = store.start(); await tick();
  await store.remove('p1', 'v1'); stop();
  const next = createCartStore('api', options), stopNext = next.start(); await tick();
  assert.equal(next.getSnapshot().count, 0); assert.equal(next.getSnapshot().storageTabOnly, true);
  assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line()]); stopNext();
});

test('denied storage retains a usable memory cart without claiming persistence', async () => {
  const f = fixture(); f.deny();
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => resolved(lines) });
  const stop = store.start(); await store.add('p2', 'v1'); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().storageUnavailable, true);
  assert.equal(store.getSnapshot().storageTabOnly, false); stop();
});

test('storage failure during resolution does not erase rows or authorize stale totals', async () => {
  const f = fixture(); let finish!: (value: CartResolution) => void;
  const store = createCartStore('api', { runtime: f.runtime, resolve: () => new Promise(resolve => { finish = resolve; }) });
  const stop = store.start(); f.deny(); finish(resolved([line()])); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().status, 'error');
  assert.equal(store.getSnapshot().storageUnavailable, true); stop();
});

test('queued mutations from a stopped lifecycle cannot execute after restart', async () => {
  const f = fixture(); const pending: Array<() => void> = [];
  const runtime: CartRuntime = { ...f.runtime, lock: (_key, task) => new Promise<void>(resolve => pending.push(() => { task(); resolve(); })) };
  const store = createCartStore('api', { runtime, resolve: async lines => resolved(lines) });
  const stop = store.start(); await tick(); const oldWrite = store.add('p2', 'v1'); stop();
  const stopAgain = store.start(); pending.shift()!(); await oldWrite; await tick();
  assert.equal(store.getSnapshot().count, 1); assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line()]); stopAgain();
});

test('restart rejects old responses and stale cleanup does not stop the new lifecycle', async () => {
  const f = fixture(); let finish!: (value: CartResolution) => void; let calls = 0;
  const store = createCartStore('api', { runtime: f.runtime, resolve: lines => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(resolved(lines)) });
  const oldStop = store.start(); oldStop(); const stop = store.start(); oldStop();
  finish({ resolved: [], missing: [line()] }); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(f.listeners.size, 1); stop();
});

test('demo and API keys remain isolated and quantities stay bounded', async () => {
  const f = fixture([line('p1', 999)]), options = { runtime: f.runtime, resolve: async (lines: CartPair[]) => resolved(lines) };
  const api = createCartStore('api', options), demo = createCartStore('demo', options);
  const stopApi = api.start(), stopDemo = demo.start(); await tick();
  assert.equal(demo.getSnapshot().count, 0); await api.add('p1', 'v1'); await demo.add('p2', 'v1'); await tick();
  assert.equal(api.getSnapshot().count, 999); assert.equal(demo.getSnapshot().count, 1);
  stopApi(); stopDemo();
});

test('missing response checks storage again after waiting for a lock', async () => {
  const f = fixture(); let grant!: () => void; let calls = 0;
  const runtime: CartRuntime = { ...f.runtime, lock: (_key, task) => new Promise<void>(resolve => { grant = () => { task(); resolve(); }; }) };
  const store = createCartStore('api', { runtime, resolve: async lines => ++calls === 1 ? { resolved: [], missing: lines } : resolved(lines) });
  const stop = store.start(); await tick();
  f.seed([line(), line('p2')]); grant(); await tick();
  assert.equal(store.getSnapshot().count, 2); assert.equal(store.getSnapshot().removedNotice, 0); stop();
});

test('failure of a write preserves the transformed lines in memory', async () => {
  const f = fixture(); let writesFail = false;
  const runtime: CartRuntime = { ...f.runtime, write: (...args) => writesFail ? null : f.runtime.write(...args) };
  const store = createCartStore('api', { runtime, resolve: async lines => resolved(lines) });
  const stop = store.start(); await tick(); writesFail = true;
  await store.add('p2', 'v1'); await tick();
  assert.equal(store.getSnapshot().count, 2); assert.equal(store.getSnapshot().storageUnavailable, true);
  assert.equal(store.getSnapshot().storageTabOnly, false);
  assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line()]); stop();
});

test('lost storage while pruning retains unverified rows instead of deleting them', async () => {
  const f = fixture(); let grant!: () => void;
  const runtime: CartRuntime = { ...f.runtime, lock: (_key, task) => new Promise<void>(resolve => { grant = () => { task(); resolve(); }; }) };
  const store = createCartStore('api', { runtime, resolve: async lines => ({ resolved: [], missing: lines }) });
  const stop = store.start(); await tick(); f.deny(); grant(); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().status, 'error');
  assert.equal(store.getSnapshot().storageUnavailable, true); stop();
});

test('existing empty session snapshot wins even when shared locks become available', async () => {
  const f = fixture(); f.seed([], 'session');
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => resolved(lines) });
  const stop = store.start(); await tick();
  assert.equal(store.getSnapshot().count, 0); assert.equal(store.getSnapshot().storageTabOnly, true);
  await store.add('p2', 'v1'); assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line()]); stop();
});

test('stopped API store cannot notify or mutate after a different mode starts', async () => {
  const f = fixture(); let finish!: (value: CartResolution) => void, notifications = 0;
  const api = createCartStore('api', { runtime: f.runtime, resolve: () => new Promise(resolve => { finish = resolve; }) });
  const unsubscribe = api.subscribe(() => { notifications++; });
  const stop = api.start(); stop(); const atStop = notifications;
  const demo = createCartStore('demo', { runtime: f.runtime, resolve: async lines => resolved(lines) });
  const stopDemo = demo.start(); finish({ resolved: [], missing: [line()] }); await tick();
  assert.equal(notifications, atStop); assert.equal(demo.getSnapshot().count, 0);
  assert.deepEqual(f.runtime.read(f.key, 'local')?.lines, [line()]); unsubscribe(); stopDemo();
});

test('a full cart rejects new pairs but keeps existing quantity changes', async () => {
  const f = fixture(Array.from({ length: 1000 }, (_, i) => line(`p${i}`)));
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => resolved(lines) });
  const stop = store.start(); await tick(); await store.add('extra', 'v1'); await store.adjust('p1', 'v1', 1); await tick();
  assert.equal(store.getSnapshot().items.length, 1000); assert.equal(store.getSnapshot().count, 1001); stop();
});

test('stopping from a loading notification prevents launching work after cleanup', async () => {
  const f = fixture(); let calls = 0;
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => { calls++; return resolved(lines); } });
  const stop = store.start(); await tick();
  const unsubscribe = store.subscribe(() => { if (store.getSnapshot().status === 'loading') stop(); });
  store.retry(); await tick();
  assert.equal(calls, 1); assert.equal(f.listeners.size, 0); unsubscribe();
});

test('restarting from a loading notification launches only the new lifecycle request', async () => {
  const f = fixture(); let calls = 0, restart = true;
  const store = createCartStore('api', { runtime: f.runtime, resolve: async lines => { calls++; return resolved(lines); } });
  let stop = store.start(); await tick();
  const unsubscribe = store.subscribe(() => {
    if (restart && store.getSnapshot().status === 'loading') { restart = false; stop(); stop = store.start(); }
  });
  store.retry(); await tick();
  assert.equal(calls, 2); assert.equal(store.getSnapshot().status, 'idle'); unsubscribe(); stop();
});

test('same-document suspension retains a memory-only cart without promising navigation persistence', async () => {
  const f = fixture(); f.deny();
  const options = { runtime: f.runtime, resolve: async (lines: CartPair[]) => resolved(lines) };
  const store = createCartStore('api', options);
  const stop = store.start(); await store.add('p2', 'v1'); await tick(); stop();
  const resumeStop = store.start(); await tick();
  assert.equal(store.getSnapshot().count, 1); assert.equal(store.getSnapshot().storageUnavailable, true);
  assert.equal(store.getSnapshot().storageTabOnly, false); resumeStop();
  const newDocument = createCartStore('api', options), newStop = newDocument.start();
  assert.equal(newDocument.getSnapshot().count, 0); newStop();
});
