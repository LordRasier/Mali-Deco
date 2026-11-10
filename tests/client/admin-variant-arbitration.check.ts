import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminProducts, type AdminProductsView } from '../../src/presentation/admin/client/browser/products/product-controller';
import { createVariantEditor } from '../../src/presentation/admin/client/browser/products/variant-editor';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { ApiError } from '../../src/presentation/admin/client/api';

function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const input = { sku: 'SKU', name: 'Unsaved variant', priceMinor: 1234, currency: 'ARS', supplyMode: 'stock' as const };

test('cancel read then variant save aborts the old read and preserves draft plus uncertain write warning', async () => {
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never); await session.login('email', 'password');
  const read = deferred<string>(), write = deferred<never>(); let html = 'variant draft', warning = '', reads = 0, writes = 0;
  let signal: AbortSignal | undefined;
  const view: AdminProductsView = { render(next) { html = next; editor.dispose(); }, loading() {}, busy() {}, error(text) { warning = text; }, committed() {}, focus() {} };
  const product = createAdminProducts(session, view, { read: async (_route, nextSignal) => { reads++; signal = nextSignal; return reads === 1 ? read.promise : 'explicit later detail'; },
    request: async () => { throw Error('unexpected product mutation'); }, confirm: () => true }, { view: 'variant-edit', id: 'p1', variantId: 'v1', page: 2 });
  const editor = createVariantEditor(session, { busy() {}, error(text) { warning = text; }, committed() { html = 'committed'; } }, 'p1', false,
    { request: async () => { writes++; return write.promise; }, confirm: () => true }, product.beginMutation);
  const pendingRead = product.cancel(); const pendingWrite = editor.save(input, 'v1');
  read.resolve('obsolete detail'); await pendingRead;
  write.reject(new ApiError(0, 'Unknown write outcome')); await pendingWrite;
  assert.equal(signal?.aborted, true); assert.equal(html, 'variant draft'); assert.match(warning, /Unknown write outcome/); assert.equal(writes, 1);
  await product.cancel(); assert.equal(reads, 2); assert.equal(html, 'explicit later detail'); product.dispose(); editor.dispose();
});

test('parent navigation and product mutations cannot race a reserved variant write', async () => {
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never); await session.login('email', 'password');
  const write = deferred<never>(); let reads = 0, parentWrites = 0;
  const view: AdminProductsView = { render() {}, loading() {}, busy() {}, error() {}, committed() {}, focus() {} };
  const product = createAdminProducts(session, view, { read: async () => { reads++; return ''; }, request: async () => { parentWrites++; return undefined as never; }, confirm: () => true }, { view: 'detail', id: 'p1' });
  const variant = createVariantEditor(session, { busy() {}, error() {}, committed() {} }, 'p1', false,
    { request: () => write.promise, confirm: () => true }, product.beginMutation);
  const pending = variant.save(input, 'v1'); await product.cancel(); await product.archive(false);
  assert.equal(reads, 0); assert.equal(parentWrites, 0);
  write.reject(new ApiError(503, 'Unknown outcome')); await pending;
  await product.cancel(); assert.equal(reads, 1); variant.dispose(); product.dispose();
});
