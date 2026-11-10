import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { createAdminProducts, type AdminProductRoute, type AdminProductsView } from '../../src/presentation/admin/client/browser/products/product-controller';
import type { ProductInput } from '../../src/presentation/admin/client/types';

const user = { id: 'admin', email: 'admin@example.invalid', role: 'catalog' as const };
const input: ProductInput = { name: 'Product', slug: 'product', description: '', status: 'draft',
  productWeightG: null, productWidthMm: null, productHeightMm: null, productLengthMm: null,
  packageWeightG: null, packageWidthMm: null, packageHeightMm: null, packageLengthMm: null };
const saved = { ...input, id: 'p1', categoryId: null, archivedAt: null };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function fixture(initial: AdminProductRoute = { view: 'create' }) {
  const session = createSessionStore(async () => ({ user, csrf: 'csrf-token' }) as never); await session.login('email', 'password');
  const calls: [string, RequestOptions | undefined][] = [], reads: AdminProductRoute[] = [];
  let html = 'original draft', error = '', busy = false, committed = 0, confirmed = true;
  const view: AdminProductsView = { render(value) { html = value; }, error(message) { error = message; }, busy(value) { busy = value; }, loading() {}, focus() {},
    committed() { committed++; html = 'committed notice, no editable form'; } };
  const runtime = {
    read: async (route: AdminProductRoute, signal: AbortSignal) => { assert.equal(signal.aborted, false); reads.push(route); return 'server detail'; },
    request: async (path: string, options?: RequestOptions) => { calls.push([path, options]); return saved as never; },
    confirm: () => confirmed,
  };
  return { session, view, runtime, calls, reads, initial, get html() { return html; }, get error() { return error; }, get busy() { return busy; },
    get committed() { return committed; }, denyConfirmation() { confirmed = false; } };
}

test('create sends one existing JSON mutation with CSRF and opens the saved product', async () => {
  const f = await fixture(), pending = deferred<never>();
  f.runtime.request = async (path, options) => { f.calls.push([path, options]); return pending.promise; };
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  const first = controller.save(input); await controller.save(input); assert.equal(f.calls.length, 1); assert.equal(f.busy, true);
  pending.resolve(saved as never); await first;
  assert.deepEqual(f.calls, [['/admin/catalog/products', { method: 'POST', body: input, csrf: 'csrf-token' }]]);
  assert.deepEqual(f.reads, [{ view: 'detail', id: 'p1' }]); assert.equal(f.committed, 1); assert.equal(f.busy, false); controller.dispose();
});

test('create with an initial price uses a single atomic mutation', async () => {
  const f = await fixture();
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  const price = { priceMinor: 125000, currency: 'ARS', supplyMode: 'made_to_order' as const };
  await controller.save(input, price);
  assert.deepEqual(f.calls, [['/admin/catalog/products/with-price', { method: 'POST', body: { product: input, price }, csrf: 'csrf-token' }]]);
  assert.equal(f.committed, 1); controller.dispose();
});

test('uncertain mutation keeps the draft and never retries writes or claims success', async () => {
  const f = await fixture(); f.runtime.request = async (path, options) => { f.calls.push([path, options]); throw new ApiError(0, 'Outcome unknown; inspect catalog'); };
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  await controller.save(input); await settle(); controller.retry(); await settle();
  assert.equal(f.calls.length, 1); assert.equal(f.html, 'original draft'); assert.equal(f.committed, 0); assert.deepEqual(f.reads, []);
  assert.match(f.error, /unknown/); assert.equal(f.busy, false); controller.dispose();
});

test('create never hands local photos to an unconfirmed or already published product', async () => {
  for (const wrong of [{ ...saved, slug: 'other' }, { ...saved, name: 'Other item' }, { ...saved, status: 'active' }]) {
    const f = await fixture(); f.runtime.request = async () => wrong as never;
    const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
    await controller.save(input); assert.equal(f.committed, 0); assert.deepEqual(f.reads, []);
    assert.equal(f.html, 'original draft'); assert.match(f.error, /confirmar/); controller.dispose();
  }
});

test('update binds response identity and rejects malformed acknowledgements as uncertain', async () => {
  for (const response of [{ ...saved, id: 'another' }, { ...saved, status: ['draft'] }, { ...saved, status: { toString: () => 'draft' } }, {}, undefined]) {
    const f = await fixture({ view: 'edit', id: 'p1' }); f.runtime.request = async (path, options) => { f.calls.push([path, options]); return response as never; };
    const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial); await controller.save(input);
    assert.equal(f.calls[0][0], '/admin/catalog/products/p1'); assert.equal(f.calls[0][1]?.method, 'PUT');
    assert.equal(f.committed, 0); assert.match(f.error, /confirmar/); assert.equal(f.html, 'original draft'); controller.dispose();
  }
});

test('archive requires confirmation, uses the current detail and accepts only the canonical empty acknowledgement', async () => {
  const f = await fixture({ view: 'detail', id: 'p1' }); f.runtime.request = async (path, options) => { f.calls.push([path, options]); return undefined as never; };
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  await controller.archive(true); assert.deepEqual(f.calls, []);
  await controller.archive(false); assert.deepEqual(f.calls, [['/admin/catalog/products/p1', { method: 'DELETE', csrf: 'csrf-token' }]]);
  assert.equal(f.committed, 1); controller.dispose();
  const declined = await fixture({ view: 'detail', id: 'p1' }); declined.denyConfirmation();
  const canceled = createAdminProducts(declined.session, declined.view, declined.runtime, declined.initial); await canceled.archive(false); assert.deepEqual(declined.calls, []); canceled.dispose();
});

test('a committed write removes the editable form even when its follow-up read fails', async () => {
  const f = await fixture(); f.runtime.read = async route => { f.reads.push(route); throw new ApiError(503, 'Read failed'); };
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial); await controller.save(input);
  assert.equal(f.committed, 1); assert.match(f.html, /no editable form/); await controller.save(input); assert.equal(f.calls.length, 1);
  controller.retry(); await settle(); assert.equal(f.calls.length, 1); assert.equal(f.reads.length, 2); controller.dispose();
});

test('superseded reads and old mutation responses cannot modify a new or disposed owner', async () => {
  const f = await fixture({ view: 'list', page: 2, search: 'name' }), old = deferred<string>();
  f.runtime.read = async route => { f.reads.push(route); return route.view === 'create' ? old.promise : 'current detail'; };
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  const pending = controller.navigate({ view: 'create' }); await controller.navigate({ view: 'detail', id: 'p1' });
  old.resolve('obsolete create'); await pending; assert.equal(f.html, 'current detail');
  await controller.list(); assert.deepEqual(f.reads.at(-1), { view: 'list', page: 2, search: 'name' }); controller.dispose();
  const w = await fixture(), write = deferred<never>(); w.runtime.request = () => write.promise;
  const writer = createAdminProducts(w.session, w.view, w.runtime, w.initial), saving = writer.save(input);
  await w.session.login('other', 'password'); write.resolve(saved as never); await saving;
  assert.equal(w.committed, 0); assert.equal(w.html, 'original draft'); writer.dispose();
});

test('synchronous busy cleanup and missing authority prevent writes from starting', async () => {
  const f = await fixture(), controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  f.view.busy = () => controller.dispose(); await controller.save(input); assert.deepEqual(f.calls, []);
  const denied = await fixture(), restricted = createAdminProducts(denied.session, denied.view, denied.runtime, denied.initial);
  denied.session.expire(); await restricted.save(input); assert.deepEqual(denied.calls, []); restricted.dispose();
});

test('cleanup during successful-write publication prevents subsequent committed rendering', async () => {
  const f = await fixture(), controller = createAdminProducts(f.session, f.view, f.runtime, f.initial);
  const busy = f.view.busy; f.view.busy = value => { busy(value); if (!value) controller.dispose(); };
  await controller.save(input); assert.equal(f.committed, 0); assert.deepEqual(f.reads, []);
});

test('acknowledged product archival tells retained child owners to become read-only immediately', async () => {
  const f = await fixture({ view: 'detail', id: 'p1' }); let commitment: unknown;
  f.view.committed = result => { commitment = result; };
  f.runtime.request = async () => undefined as never;
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial); await controller.archive(false);
  assert.deepEqual(commitment, { productId: 'p1', archived: true }); controller.dispose();
});

test('saving product metadata preserves the current variant page rather than resetting it', async () => {
  const f = await fixture({ view: 'edit', id: 'p1', page: 2 });
  const controller = createAdminProducts(f.session, f.view, f.runtime, f.initial); await controller.save(input);
  assert.deepEqual(f.reads, [{ view: 'detail', id: 'p1', page: 2 }]); controller.dispose();
});
