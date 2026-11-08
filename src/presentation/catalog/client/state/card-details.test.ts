import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardDetails } from './card-details';
import type { fetchProductDetail } from '../../../shared/catalog/api-catalog';

const page = (number: number, slug = 'p', total = 103) => ({ page: number, limit: 100, total, product: {
  id: slug, slug, name: slug, description: 'Descripción real', productWidthMm: 120, productHeightMm: null, productLengthMm: null, category: null, images: [],
  variants: Array.from({ length: Math.min(100, total - (number - 1) * 100) }, (_, i) => ({ id: `${slug}-v${(number - 1) * 100 + i}`, name: `Opción ${i}`, currency: 'ARS', priceMinor: i, supplyMode: undefined, material: null, colorInfo: null, color: undefined })) } });
test('detail is lazy and loads over one hundred variants in explicit pages', async () => {
  const calls: number[] = []; const state = createCardDetails(async (_base, slug, p) => { calls.push(p!); return page(p!, slug); });
  assert.deepEqual(calls, []); await state.open({ id: 'p', slug: 'p' });
  assert.equal(state.snapshot().product?.variants.length, 100); assert.equal(state.snapshot().hasMore, true);
  await state.more(); assert.equal(state.snapshot().product?.variants.length, 103); assert.equal(state.snapshot().hasMore, false);
  assert.deepEqual(calls, [1, 2]); assert.equal(state.snapshot().product?.productWidthMm, 120);
});
test('closing and switching products aborts and ignores obsolete responses', async () => {
  const requests: { finish: (value: ReturnType<typeof page>) => void; signal: AbortSignal }[] = [];
  const state = createCardDetails(((_base, _slug, _p, signal) => new Promise(accept => requests.push({ finish: accept, signal: signal! }))) as typeof fetchProductDetail);
  const a = state.open({ id: 'p', slug: 'p' }); const b = state.open({ id: 'q', slug: 'q' });
  assert.equal(requests[0].signal.aborted, true); requests[0].finish(page(1)); await a;
  requests[1].finish(page(1, 'q')); await b; assert.equal(state.snapshot().product?.id, 'q');
  const c = state.more(); state.close(); assert.equal(requests[2].signal.aborted, true); requests[2].finish(page(2, 'q')); await c;
  assert.equal(state.snapshot().product, undefined);
});
test('initial network errors are retryable and changed totals require a fresh load', async () => {
  let fail = true, conflict = false;
  const state = createCardDetails(async (_base, slug, p) => {
    if (fail) throw Error('Sin conexión');
    return page(p!, slug, conflict ? 104 : 103);
  });
  await state.open({ id: 'p', slug: 'p' }); assert.equal(state.snapshot().error, 'Sin conexión');
  fail = false; await state.retry(); assert.equal(state.snapshot().product?.variants.length, 100);
  conflict = true; await state.more(); assert.equal(state.snapshot().product, undefined); assert.match(state.snapshot().error, /cambió/);
  await state.retry(); assert.equal(state.snapshot().product?.variants.length, 100);
});

test('failed later pages preserve loaded choices and retry the same page without duplicates', async () => {
  let fail = true; const calls: number[] = [];
  const state = createCardDetails(async (_base, slug, p) => {
    calls.push(p!); if (p === 2 && fail) throw Error('Sin conexión'); return page(p!, slug);
  });
  await state.open({ id: 'p', slug: 'p' }); await state.more();
  assert.equal(state.snapshot().product?.variants.length, 100); assert.equal(state.snapshot().error, 'Sin conexión');
  fail = false; await state.retry(); assert.deepEqual(calls, [1, 2, 2]); assert.equal(state.snapshot().product?.variants.length, 103);
});

test('overlapping option pages fail closed instead of selecting a stale or duplicate option', async () => {
  const state = createCardDetails(async (_base, slug, p) => {
    const result = page(p!, slug); if (p === 2) result.product.variants[0].id = 'p-v0'; return result;
  });
  await state.open({ id: 'p', slug: 'p' }); await state.more();
  assert.equal(state.snapshot().product, undefined); assert.match(state.snapshot().error, /cambió/);
});
