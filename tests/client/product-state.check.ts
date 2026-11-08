import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductStore } from '../../src/presentation/products/client/state/product-store';
import type { ProductRuntime } from '../../src/presentation/products/client/state/product-runtime';
import { resolveRequestedVariant } from '../../src/presentation/shared/products/product-selection';
import type { Product, Variant } from '../../src/presentation/shared/catalog/storefront-types';

const variant = (id: string): Variant => ({ id, name: id, priceMinor: 100, currency: 'ARS' });
const product: Product = { id: 'p1', slug: 'piece', name: 'Piece', description: '', variants: [variant('v1')] };
const fullProduct: Product = { ...product, variants: Array.from({ length: 100 }, (_, i) => variant(`v${i + 1}`)) };
const secondPage = () => ({ product: { ...fullProduct, productWidthMm: null, productHeightMm: null, productLengthMm: null,
  category: null, images: [], variants: Array.from({ length: 100 }, (_, i) => variant(`v${i + 101}`)) }, page: 2, total: 200, limit: 100 });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function environment(search = '') {
  let url = new URL(`https://shop.invalid/productos/piece${search}#details`), reads = 0, writes = 0;
  const listeners = new Set<() => void>(), history: (() => void)[] = [];
  const runtime: ProductRuntime = {
    search() { reads++; return url.search; },
    choose(id) { writes++; url.searchParams.delete('variant'); url.searchParams.set('variant', id); },
    listen(callback) { listeners.add(callback); history.push(callback); return () => { listeners.delete(callback); }; },
  };
  return { runtime, history, listeners, get reads() { return reads; }, get writes() { return writes; }, get url() { return url; },
    pop(search: string) { url = new URL(`https://shop.invalid/productos/piece${search}#details`); for (const listener of listeners) listener(); } };
}

test('construction and server snapshots are inert, stable and isolated from later publication', async () => {
  const env = environment();
  const store = createProductStore(product, 101, 'api', { runtime: env.runtime });
  const server = store.getServerSnapshot();
  assert.equal(env.reads, 0); assert.equal(env.listeners.size, 0);
  assert.equal(store.getSnapshot(), server); assert.equal(store.getSnapshot(), store.getSnapshot());
  store.choose('v1'); store.retry(); await store.loadMore();
  assert.equal(env.reads, 0); assert.equal(env.writes, 0);
  const stop = store.start(); await settle();
  assert.equal(store.getSnapshot().selected?.id, 'v1');
  assert.equal(store.getSnapshot().status, 'ready');
  assert.equal(store.getServerSnapshot(), server); assert.equal(server.selected, null);
  assert.throws(() => store.start(), /already started/);
  stop(); assert.equal(env.listeners.size, 0);
});

test('absent, invalid, duplicate and unavailable queries retain selection semantics without scanning', async () => {
  for (const search of ['', '?variant=', '?variant=v1&variant=v2', '?variant=missing']) {
    const env = environment(search), pairs: unknown[] = [];
    const store = createProductStore(product, 101, 'api', { runtime: env.runtime,
      resolve: (id, variants, query, mode, signal) => resolveRequestedVariant(id, variants, query, mode, signal, async lines => {
        pairs.push(lines); return { resolved: [], missing: lines };
      }),
    });
    const stop = store.start(); await settle();
    const state = store.getSnapshot();
    assert.equal(state.selected?.id ?? null, search ? null : 'v1');
    assert.equal(Boolean(state.warning), Boolean(search));
    assert.deepEqual(pairs, search.endsWith('missing') ? [[{ productId: 'p1', variantId: 'missing' }]] : []);
    stop();
  }
});

test('late resolver fulfillment and rejection cannot undo choose or popstate', async () => {
  for (const reject of [false, true]) {
    const env = environment('?variant=old'), pending = deferred<{ variant: Variant | null; warning: string | null }>();
    const store = createProductStore(product, 101, 'api', { runtime: env.runtime,
      resolve: (id, variants, query, mode, signal) => query.kind === 'id' && query.id === 'old'
        ? pending.promise : resolveRequestedVariant(id, variants, query, mode, signal),
    });
    const stop = store.start();
    store.choose('v1'); await settle();
    assert.equal(env.url.search, '?variant=v1'); assert.equal(env.url.hash, '#details');
    env.pop('?variant=v1&variant=v1'); await settle();
    const current = store.getSnapshot();
    if (reject) pending.reject(new Error('late')); else pending.resolve({ variant: variant('old'), warning: null });
    await settle(); assert.equal(store.getSnapshot(), current);
    assert.equal(current.selected, null); assert.ok(current.warning); stop();
  }
});

test('retry recovers synchronous resolver throws and unsubscribe prevents publication callbacks', async () => {
  const env = environment(); let calls = 0, notifications = 0;
  const store = createProductStore(product, 1, 'demo', { runtime: env.runtime,
    resolve: () => { if (++calls === 1) throw new Error('offline'); return Promise.resolve({ variant: variant('v1'), warning: null }); },
  });
  const unsubscribe = store.subscribe(() => { notifications++; });
  const stop = store.start(); await settle(); assert.equal(store.getSnapshot().status, 'error');
  unsubscribe(); const before = notifications;
  store.retry(); await settle(); assert.equal(store.getSnapshot().status, 'ready'); assert.equal(notifications, before);
  stop();
});

test('stop/restart excludes old resolver completions, queued events and obsolete cleanup', async () => {
  const env = environment(), pending = deferred<{ variant: Variant | null; warning: string | null }>(); let calls = 0;
  const store = createProductStore(product, 101, 'api', { runtime: env.runtime,
    resolve: () => ++calls === 1 ? pending.promise : Promise.resolve({ variant: variant('fresh'), warning: null }),
  });
  const stopOld = store.start(); stopOld(); const stop = store.start(); await settle();
  const current = store.getSnapshot();
  env.history[0](); stopOld();
  pending.resolve({ variant: variant('old'), warning: null }); await settle();
  assert.equal(store.getSnapshot(), current); assert.equal(calls, 2); assert.equal(env.listeners.size, 1); stop();
});

test('synchronous subscriber cleanup cancels work before resolver invocation', async () => {
  const env = environment(); let calls = 0;
  const store = createProductStore(product, 1, 'demo', { runtime: env.runtime,
    resolve: async () => { calls++; return { variant: variant('v1'), warning: null }; },
  });
  const stop = store.start(); await settle();
  store.subscribe(() => { if (store.getSnapshot().status === 'loading') stop(); });
  store.retry(); await settle(); assert.equal(calls, 1); assert.equal(env.listeners.size, 0);
});

test('pagination retains an off-page selection separately and never requests beyond the last page', async () => {
  const env = environment('?variant=v101'), pages: number[] = [], pairs: unknown[] = [];
  const store = createProductStore(fullProduct, 200, 'api', { runtime: env.runtime,
    resolve: (id, variants, query, mode, signal) => resolveRequestedVariant(id, variants, query, mode, signal, async lines => {
      pairs.push(lines); return { resolved: [{ ...lines[0], product, variant: variant('v101') }], missing: [] };
    }),
    fetchPage: async (base, slug, page) => { assert.equal(base, '/api/v1/'); assert.equal(slug, 'piece'); pages.push(page!); return secondPage(); },
  });
  const stop = store.start(); await settle();
  assert.deepEqual(pairs, [[{ productId: 'p1', variantId: 'v101' }]]);
  assert.equal(store.getSnapshot().variants.length, 100); assert.equal(store.getSnapshot().selected?.id, 'v101');
  await store.loadMore();
  assert.equal(store.getSnapshot().variants.length, 200); assert.equal(store.getSnapshot().selected?.id, 'v101');
  assert.equal(store.getSnapshot().pageConflict, false); assert.equal(store.getSnapshot().hasMore, false);
  await store.loadMore(); assert.deepEqual(pages, [2]); stop();
});

test('page failures, identity drift, total drift and overlap do not advance the cursor and can be retried', async () => {
  for (const failure of ['throw', 'id', 'slug', 'total', 'overlap', 'duplicate', 'page', 'limit', 'count']) {
    const env = environment(), pages: number[] = []; let attempts = 0;
    const store = createProductStore(fullProduct, 200, 'api', { runtime: env.runtime,
      fetchPage: async (_base, _slug, page) => {
        pages.push(page!); const response = secondPage();
        if (++attempts > 1) return response;
        if (failure === 'throw') throw new Error('offline');
        if (failure === 'id') response.product.id = 'p2';
        if (failure === 'slug') response.product.slug = 'other';
        if (failure === 'total') response.total = 201;
        if (failure === 'overlap') response.product.variants[0] = variant('v1');
        if (failure === 'duplicate') response.product.variants[1] = response.product.variants[0];
        if (failure === 'page') response.page = 3;
        if (failure === 'limit') response.limit = 50;
        if (failure === 'count') response.product.variants.pop();
        return response;
      },
    });
    const stop = store.start(); await settle(); await store.loadMore();
    assert.equal(store.getSnapshot().variants.length, 100, failure);
    assert.equal(store.getSnapshot().pageError, true, failure);
    assert.equal(store.getSnapshot().loadingMore, false, failure);
    assert.equal(store.getSnapshot().hasMore, true, failure);
    assert.equal(store.getSnapshot().pageConflict, failure === 'overlap' || failure === 'duplicate', failure);
    await store.loadMore();
    assert.deepEqual(pages, [2, 2], failure); assert.equal(store.getSnapshot().variants.length, 200, failure);
    assert.equal(store.getSnapshot().pageError, false); assert.equal(store.getSnapshot().selected?.id, 'v1'); stop();
  }
});

test('page requests are serialized and selection/popstate/restart reject old completions and finally blocks', async () => {
  for (const change of ['choose', 'pop', 'restart']) {
    for (const reject of [false, true]) {
      const env = environment(), old = deferred<ReturnType<typeof secondPage>>(), fresh = deferred<ReturnType<typeof secondPage>>();
      let calls = 0;
      const store = createProductStore(fullProduct, 200, 'api', { runtime: env.runtime,
        fetchPage: () => ++calls === 1 ? old.promise : fresh.promise,
      });
      let stop = store.start(); await settle();
      const oldRequest = store.loadMore(); await store.loadMore(); assert.equal(calls, 1);
      if (change === 'choose') store.choose('v2');
      if (change === 'pop') env.pop('?variant=v2');
      if (change === 'restart') { stop(); stop = store.start(); }
      await settle(); assert.equal(store.getSnapshot().loadingMore, false);
      const freshRequest = store.loadMore(); assert.equal(calls, 2);
      if (reject) old.reject(new Error('late')); else old.resolve(secondPage());
      await oldRequest;
      assert.equal(store.getSnapshot().variants.length, 100);
      assert.equal(store.getSnapshot().loadingMore, true); assert.equal(store.getSnapshot().pageError, false);
      fresh.resolve(secondPage()); await freshRequest;
      assert.equal(store.getSnapshot().variants.length, 200); assert.equal(store.getSnapshot().loadingMore, false);
      assert.equal(store.getSnapshot().selected?.id, change === 'restart' ? 'v1' : 'v2'); stop();
    }
  }
});

test('synchronous page subscriber cleanup or selection change prevents the outgoing fetch', async () => {
  for (const change of ['stop', 'choose']) {
    const env = environment(); let calls = 0;
    const store = createProductStore(fullProduct, 200, 'api', { runtime: env.runtime,
      fetchPage: async () => { calls++; return secondPage(); },
    });
    const stop = store.start(); await settle();
    store.subscribe(() => {
      if (store.getSnapshot().loadingMore) { if (change === 'stop') stop(); else store.choose('v2'); }
    });
    await store.loadMore(); await settle(); assert.equal(calls, 0);
    assert.equal(store.getSnapshot().variants.length, 100); stop();
  }
});

test('demo products do not paginate', async () => {
  const env = environment(); let calls = 0;
  const store = createProductStore(fullProduct, 200, 'demo', { runtime: env.runtime,
    fetchPage: async () => { calls++; return secondPage(); },
  });
  const stop = store.start(); await settle(); await store.loadMore();
  assert.equal(calls, 0); assert.equal(store.getSnapshot().hasMore, false); stop();
});
