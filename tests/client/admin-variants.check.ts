import assert from 'node:assert/strict';
import test from 'node:test';
import { createVariantEditor } from '../../src/presentation/admin/client/browser/products/variant-editor';
import { variantFormInput } from '../../src/presentation/admin/client/browser/products/variant-form';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';
import { bulkWarningInput, stockInput } from '../../src/presentation/admin/client/browser/products/inventory-form';

test('compact inventory controls validate exact integers and atomic warning settings', () => {
  assert.deepEqual(stockInput('5', '3'), { stockQuantity: 5, expectedStockQuantity: 3 });
  for (const value of ['-1', '1.5', '1000001', '', '1e2']) assert.throws(() => stockInput(value, '3'));
  assert.deepEqual(bulkWarningInput('', ''), { bulkWarningThreshold: null, bulkWarningMessage: null });
  assert.deepEqual(bulkWarningInput('5', ' Large order '), { bulkWarningThreshold: 5, bulkWarningMessage: 'Large order' });
  for (const [n, text] of [['0', 'x'], ['1001', 'x'], ['3', ''], ['', 'x']]) assert.throws(() => bulkWarningInput(n, text));
});

test('stock editor sends CAS only and verifies acknowledgements', async () => {
  const f = await fixture(); f.runtime.request = async (path, options) => { f.calls.push([path, options]); return { id: 'v1', productId: 'p1', stockQuantity: 5 } as never; };
  const editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime);
  await editor.saveStock({ stockQuantity: 5, expectedStockQuantity: 3 }, 'v1');
  assert.deepEqual(f.calls[0], ['/admin/catalog/products/p1/variants/v1/stock', { method: 'PUT', csrf: 'csrf', body: { stockQuantity: 5, expectedStockQuantity: 3 } }]);
  assert.equal(f.committed, 1);
  f.runtime.request = async () => ({ id: 'v2', productId: 'p1', stockQuantity: 5 }) as never;
  await editor.saveStock({ stockQuantity: 5, expectedStockQuantity: 3 }, 'v1'); assert.equal(f.committed, 1); assert.match(f.error, /confirmar/);
  editor.dispose();
});

test('stock acknowledgement can update only its form without discarding other product drafts', async () => {
  const f = await fixture(), receipts: unknown[] = [];
  f.runtime.request = async () => ({ id: 'v1', productId: 'p1', stockQuantity: 5 }) as never;
  const editor = createVariantEditor(f.session, { ...f.view, stockSaved: (id, quantity) => { receipts.push([id, quantity]); } }, 'p1', false, f.runtime);
  await editor.saveStock({ stockQuantity: 5, expectedStockQuantity: 3 }, 'v1');
  assert.equal(f.committed, 0); assert.deepEqual(receipts, [['v1', 5]]); editor.dispose();
});

const input = { sku: 'SKU', name: 'Variant', priceMinor: 12345, currency: 'ARS', supplyMode: 'stock' as const };
const saved = { ...input, id: 'v1', productId: 'p1', priceMinor: '12345', archivedAt: null };
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
async function fixture(readOnly = false) {
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never);
  await session.login('email', 'password');
  const calls: [string, RequestOptions | undefined][] = []; let error = '', committed = 0, busy = false;
  const view = { busy(value: boolean) { busy = value; }, error(value: string) { error = value; }, committed() { committed++; } };
  const runtime = { request: async (path: string, options?: RequestOptions) => { calls.push([path, options]); return saved as never; }, confirm: () => true };
  return { session, calls, view, runtime, readOnly, get error() { return error; }, get committed() { return committed; }, get busy() { return busy; } };
}

test('variant forms preserve currency precision, explicit supply mode and omitted/null assignments', () => {
  const values: Record<string, string> = { sku: 'SKU', name: 'Variant', price: '123.45', currency: 'ARS', supplyMode: 'stock', materialId: 'm1', colorId: 'c1' };
  const read = (name: string) => values[name] ?? '';
  assert.deepEqual(variantFormInput(read, { material: false, color: false }), { ...input, salePriceMinor: null });
  values.colorId = ''; assert.equal(variantFormInput(read, { material: false, color: true }).colorId, null);
  assert.equal('materialId' in variantFormInput(read, { material: false, color: true }), false);
  values.currency = 'JPY'; assert.throws(() => variantFormInput(read, { material: false, color: false }));
  values.price = '123'; assert.equal(variantFormInput(read, { material: true, color: false }).priceMinor, 123);
  values.supplyMode = ''; assert.throws(() => variantFormInput(read, { material: false, color: false }), /suministro/);
});

test('variant saves do not discard discount drafts after a mismatched acknowledgement', async () => {
  const f = await fixture(), editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime);
  const receipt = { ...input, id: 'v1', productId: 'p1', priceMinor: String(input.priceMinor), salePriceMinor: '9500', archivedAt: null };
  f.runtime.request = async () => receipt as never;
  await editor.save({ ...input, salePriceMinor: 9000 }, 'v1');
  assert.equal(f.committed, 0); assert.match(f.error, /confirmar/);
  receipt.salePriceMinor = '9000'; await editor.save({ ...input, salePriceMinor: 9000 }, 'v1');
  assert.equal(f.committed, 1); editor.dispose();
});

test('saving a simple price does not replay identity fields from a stale tab', async () => {
  const f = await fixture(), editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime);
  await editor.savePrice(input, 'v1');
  assert.deepEqual(f.calls, [['/admin/catalog/products/p1/variants/v1/price', {
    method: 'PUT', csrf: 'csrf', body: { priceMinor: 12345, currency: 'ARS', supplyMode: 'stock' },
  }]]);
  assert.equal(f.committed, 1); editor.dispose();
});

test('variant create/update use the current parent, CSRF and one write without automatic replay', async () => {
  const f = await fixture(), wait = deferred<never>();
  f.runtime.request = async (path, options) => { f.calls.push([path, options]); return wait.promise; };
  const editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime);
  const saving = editor.save(input); await editor.save(input); assert.equal(f.calls.length, 1); assert.equal(f.busy, true);
  wait.resolve(saved as never); await saving; assert.equal(f.committed, 1);
  assert.deepEqual(f.calls[0], ['/admin/catalog/products/p1/variants', { method: 'POST', body: input, csrf: 'csrf' }]);
  f.runtime.request = async (path, options) => { f.calls.push([path, options]); return saved as never; };
  await editor.save(input, 'v1'); assert.equal(f.calls[1][0], '/admin/catalog/products/p1/variants/v1'); assert.equal(f.calls[1][1]?.method, 'PUT'); editor.dispose();
});

test('malformed, cross-parent and mismatched variant acknowledgements retain uncertainty', async () => {
  for (const response of [{ ...saved, productId: 'p2' }, { ...saved, id: 'v2' }, { ...saved, supplyMode: ['stock'] }, { ...saved, priceMinor: 12345 }, {}]) {
    const f = await fixture(); f.runtime.request = async () => response as never;
    const editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime); await editor.save(input, 'v1');
    assert.equal(f.committed, 0); assert.match(f.error, /confirmar/); assert.equal(f.busy, false); editor.dispose();
  }
});

test('archive needs confirmation and rejects archived parents/variants without inventing restore or inventory', async () => {
  const f = await fixture(); f.runtime.request = async (path, options) => { f.calls.push([path, options]); return undefined as never; };
  const editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime);
  await editor.archive('v1', true); assert.equal(f.calls.length, 0);
  f.runtime.confirm = () => false; await editor.archive('v1', false); assert.equal(f.calls.length, 0);
  f.runtime.confirm = () => true; await editor.archive('v1', false); assert.deepEqual(f.calls[0], ['/admin/catalog/products/p1/variants/v1', { method: 'DELETE', csrf: 'csrf' }]); editor.dispose();
  const archived = createVariantEditor(f.session, f.view, 'p1', true, f.runtime); await archived.save(input); await archived.archive('v1', false); assert.equal(f.calls.length, 1); archived.dispose();
});

test('failed writes and late completions never discard drafts or mutate disposed/new session views', async () => {
  const f = await fixture(); f.runtime.request = async () => { throw new ApiError(0, 'Outcome unknown'); };
  const editor = createVariantEditor(f.session, f.view, 'p1', false, f.runtime); await editor.save(input); await settle();
  assert.equal(f.committed, 0); assert.match(f.error, /unknown/);
  const pending = deferred<never>(); f.runtime.request = () => pending.promise; const saving = editor.save(input); editor.dispose();
  pending.resolve(saved as never); await saving; assert.equal(f.committed, 0);
  const next = await fixture(), stop = createVariantEditor(next.session, next.view, 'p1', false, next.runtime);
  next.view.busy = value => { if (value) stop.dispose(); }; await stop.save(input); assert.deepEqual(next.calls, []);
});
