import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAdminProduct, productRoute } from '../../src/presentation/admin/client/browser/products/product-runtime';
import { productFormInput } from '../../src/presentation/admin/client/browser/products/product-form';
import { loadTaxonomy } from '../../src/presentation/admin/client/browser/taxonomy-options';

test('product views use the existing guarded partial route and exact whitelisted query', async () => {
  const calls: string[] = [], signal = new AbortController().signal;
  await fetchAdminProduct({ view: 'list', page: 2, search: 'blue piece' }, signal, async url => {
    calls.push(String(url)); return new Response('<section></section>', { headers: { 'Content-Type': 'text/html' } });
  });
  assert.deepEqual(calls, ['/admin/sections/products?view=list&page=2&search=blue+piece']);
  assert.deepEqual(productRoute({ productView: 'list', productPage: '2', productSearch: 'blue' }), { view: 'list', page: 2, search: 'blue' });
  assert.deepEqual(productRoute({ productView: 'edit', productId: 'p1' }), { view: 'edit', id: 'p1' });
  assert.deepEqual(productRoute({ productView: 'variant-edit', productId: 'p1', productVariantId: 'v1', productPage: '2' }), { view: 'variant-edit', id: 'p1', variantId: 'v1', page: 2 });
  for (const data of [{ productView: 'list', productPage: '0' }, { productView: 'edit', productId: '' }, { productView: 'bad' }]) assert.throws(() => productRoute(data));
});

test('list filters survive fragment parsing and transport while malformed filter metadata is rejected', async () => {
  const route = productRoute({ productView: 'list', productPage: '2', productSearch: 'MD-1', productStatusFilter: 'active', productSort: 'name_desc' });
  assert.deepEqual(route, { view: 'list', page: 2, search: 'MD-1', status: 'active', sort: 'name_desc' });
  let requested = '';
  await fetchAdminProduct(route, new AbortController().signal, async url => { requested = String(url); return new Response('<section></section>', { headers: { 'Content-Type': 'text/html' } }); });
  assert.equal(requested, '/admin/sections/products?view=list&page=2&search=MD-1&status=active&sort=name_desc');
  assert.throws(() => productRoute({ productView: 'list', productPage: '1', productStatusFilter: 'unknown' }));
  assert.throws(() => productRoute({ productView: 'list', productPage: '1', productSort: 'random' }));
});

test('form serialization reuses product validation and preserves unchanged/failed taxonomy assignments', () => {
  const fields: Record<string, string> = { name: 'Product', slug: 'product', description: '', status: 'draft', categoryId: 'existing' };
  const read = (name: string) => fields[name] ?? '';
  assert.equal('categoryId' in productFormInput(read, false), false);
  assert.equal(productFormInput(read, true).categoryId, 'existing');
  fields.categoryId = ''; assert.equal(productFormInput(read, true).categoryId, null);
  fields.productWidthMm = '-1'; assert.throws(() => productFormInput(read, false), /positivos/);
});

test('taxonomy options remain complete, bounded and cancellation stops queued page reads', async () => {
  const item = (id: number) => ({ id: String(id), slug: `s-${id}`, name: `Item ${id}`, sortOrder: id, archivedAt: null });
  const calls: string[] = [];
  const loaded = await loadTaxonomy('categories', async path => {
    calls.push(path); const page = calls.length;
    return { items: page === 1 ? Array.from({ length: 100 }, (_, i) => item(i)) : [item(100)], page, limit: 100, total: 101 } as never;
  });
  assert.equal(loaded.length, 101); assert.equal(calls.length, 2);
  for (const response of [{ items: [], page: 1, limit: 100, total: 1 }, { items: [], page: 1, limit: 100, total: 1001 }]) {
    await assert.rejects(loadTaxonomy('categories', async () => response as never));
  }
  const stop = new AbortController(); let pages = 0;
  await assert.rejects(loadTaxonomy('categories', async () => {
    pages++; stop.abort(); return { items: Array.from({ length: 100 }, (_, i) => item(i)), page: 1, limit: 100, total: 101 } as never;
  }, stop.signal));
  assert.equal(pages, 1);
});
