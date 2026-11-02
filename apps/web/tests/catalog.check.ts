import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductCard } from '../src/components/ProductCard';
import { canMutateCatalog, catalogQueryParams, displayPriceToMinor, emptyCatalogQuery, minorToDisplayPrice, parseCatalogQuery } from '../src/lib/catalog-query';
import { demoListing } from '../src/lib/demo-listing';
import { demoCatalog } from '../src/lib/demo-catalog';
import { catalogRequest, fetchCatalogPage, fetchFacets, fetchProductDetail, loadApiCatalog } from '../src/lib/api-catalog';
import { acceptsCartResolution, resolveCartPairs } from '../src/lib/cart-resolution';

async function main() {
assert.equal(canMutateCatalog(null), false);
assert.equal(canMutateCatalog(parseCatalogQuery(new URLSearchParams('category='))), false);
assert.equal(canMutateCatalog(parseCatalogQuery(new URLSearchParams('category=decoracion'))), true);
const q = { ...emptyCatalogQuery(), search: 'florero', category: ['decoracion', 'plantas'], material: ['pla-ejemplo'], color: ['azul', 'coral'], currency: 'ARS', minPriceMinor: '0', maxPriceMinor: '9007199254740991', sort: 'price_desc' as const, page: 3 };
assert.deepEqual(parseCatalogQuery(catalogQueryParams(q)), { query: q, error: null });
assert.equal(parseCatalogQuery(new URLSearchParams('currency=ARS&minPriceMinor=9007199254740992')).error !== null, true);
assert.equal(parseCatalogQuery(new URLSearchParams('category=a&category=b')).error !== null, true);
assert.equal(parseCatalogQuery(new URLSearchParams('unexpected=x')).error !== null, true);
for (const key of ['category', 'material', 'color', 'currency', 'minPriceMinor', 'maxPriceMinor', 'sort', 'page']) {
  assert.ok(parseCatalogQuery(new URLSearchParams(`${key}=`)).error, `explicit empty ${key} must fail`);
}
assert.equal(parseCatalogQuery(new URLSearchParams('search=')).error, null);
assert.equal(parseCatalogQuery(new URLSearchParams('search=')).query.search, '');
assert.equal(parseCatalogQuery(new URLSearchParams('sort=price_asc')).error !== null, true);
assert.deepEqual(parseCatalogQuery(new URLSearchParams('minPriceMinor=100')).query, emptyCatalogQuery());
assert.equal(parseCatalogQuery(new URLSearchParams('currency=ARS&minPriceMinor=200&maxPriceMinor=100')).error !== null, true);
assert.equal(displayPriceToMinor('123,45', 'ARS'), '12345');
assert.equal(displayPriceToMinor('123.45', 'ARS'), '12345');
assert.equal(displayPriceToMinor('0', 'ARS'), '0');
assert.equal(displayPriceToMinor('123', 'JPY'), '123');
assert.equal(displayPriceToMinor('1,234', 'KWD'), '1234');
assert.equal(minorToDisplayPrice('12345', 'ARS'), '123,45');
assert.throws(() => displayPriceToMinor('1.234,56', 'ARS'));
assert.throws(() => displayPriceToMinor('1,234', 'ARS'));
assert.throws(() => displayPriceToMinor('1,1', 'JPY'));
assert.throws(() => displayPriceToMinor('90071992547409,92', 'ARS'));

const base = { ...emptyCatalogQuery(), currency: 'ARS' };
assert.equal(demoListing(base).total, 3);
assert.deepEqual(demoListing({ ...base, category: ['decoracion', 'plantas'], color: ['coral'] }).items.map(p => p.id).sort(), ['espiral', 'ondas']);
assert.equal(demoListing({ ...base, category: ['organizacion'], color: ['coral'] }).total, 0);
assert.equal(demoListing({ ...base, search: 'no-existe' }).total, 0);
assert.equal(demoListing({ ...base, minPriceMinor: '2450000', maxPriceMinor: '2450000' }).total, 1);
// Different variants may not independently satisfy material and color.
const product = demoCatalog.products[0], oldMaterial = product.variants[0].material;
product.variants[0].material = { id: 'other', slug: 'otro', name: 'Otro (ejemplo)' };
assert.equal(demoListing({ ...base, category: ['decoracion'], material: ['otro'], color: ['coral'] }).total, 0);
product.variants[0].material = oldMaterial;

const variant = (id: string) => ({ id, name: id, priceMinor: 100, currency: 'ARS', supplyMode: null, material: null, color: null });
const summary = (id: string) => ({ id, slug: id, name: id, description: '', category: null, matchedVariant: variant('shared'), priceRange: null });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const calls: string[] = [];
const fetcher: typeof fetch = async input => {
  const url = new URL(String(input)); calls.push(url.pathname);
  if (url.pathname.endsWith('/settings')) return json({ name: 'Marca configurable' });
  if (url.pathname.endsWith('/products')) return json({ items: [summary('p1')], page: 1, limit: 24, total: 1 });
  if (url.pathname.endsWith('/facets')) return json({ categories: [], materials: [], colors: [], currencies: ['ARS'], priceRange: null, truncated: { categories: false, materials: false, colors: false } });
  return json({ id: 'p1', slug: 'p1', name: 'p1', description: '', productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, variants: [variant('shared')], page: 1, limit: 100, total: 1 });
};
const initial = await loadApiCatalog('http://localhost:3001/api/v1/', fetcher);
assert.equal(initial.brand, 'Marca configurable');
assert.equal(initial.products[0].image, undefined);
assert.equal(initial.products[0].variants[0].color, undefined);
const neutralCard = renderToStaticMarkup(createElement(ProductCard, { product: initial.products[0], demo: false }));
assert.match(neutralCard, /class="image-placeholder"/);
assert.doesNotMatch(neutralCard, /<img|\/storefront\//);
assert.deepEqual(calls, ['/api/v1/catalog/settings', '/api/v1/catalog/products']); // No N+1 detail requests.
assert.equal((await fetchCatalogPage('http://localhost:3001/api/v1/', base, undefined, fetcher)).items[0].variants[0].id, 'shared');
assert.equal((await fetchFacets('http://localhost:3001/api/v1/', 'ARS', undefined, fetcher)).currencies[0], 'ARS');
assert.equal((await fetchProductDetail('http://localhost:3001/api/v1/', 'p1', 1, undefined, fetcher)).product.variants[0].id, 'shared');
// Preserve response-validation and pagination regressions from the prior full-catalog adapter.
const pagedFetcher: typeof fetch = async input => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/products')) return json({ items: [summary('p25')], page: 2, limit: 24, total: 25 });
  return json({ id: 'p1', slug: 'p1', name: 'p1', description: '', productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, variants: [variant('v101')], page: 2, limit: 100, total: 101 });
};
assert.equal((await fetchCatalogPage('http://localhost:3001/api/v1/', { ...base, page: 2 }, undefined, pagedFetcher)).items[0].id, 'p25');
assert.equal((await fetchProductDetail('http://localhost:3001/api/v1/', 'p1', 2, undefined, pagedFetcher)).product.variants[0].id, 'v101');
await assert.rejects(fetchCatalogPage('http://localhost:3001/api/v1/', base, undefined, async () => json({ items: [{ ...summary('p1'), matchedVariant: { ...variant('v'), priceMinor: -1 } }], page: 1, limit: 24, total: 1 })));
await assert.rejects(fetchCatalogPage('http://localhost:3001/api/v1/', base, undefined, async () => json({ items: [], page: 1, limit: 24, total: 1 })));
await assert.rejects(loadApiCatalog('http://localhost:3001/api/v1/', async () => { throw new Error('offline'); }));
await assert.rejects(loadApiCatalog('http://localhost:3001/api/v1/', async () => json({}, 503)));
await assert.rejects(fetchFacets('http://localhost:3001/api/v1/', 'ARS', undefined, async () => json({})));

// Caller cancellation is composed with a timeout instead of disabling it.
await assert.rejects(catalogRequest('http://localhost:3001/api/v1/', 'catalog/products', { signal: new AbortController().signal }, async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))), 10));

// Late responses from an old mode, cart identity, or aborted request are ignored.
assert.equal(acceptsCartResolution({ key: 'demo', revision: 3 }, { key: 'demo', revision: 3, aborted: false }), true);
assert.equal(acceptsCartResolution({ key: 'demo', revision: 3 }, { key: 'api', revision: 3, aborted: false }), false);
assert.equal(acceptsCartResolution({ key: 'demo', revision: 3 }, { key: 'demo', revision: 4, aborted: false }), false);
assert.equal(acceptsCartResolution({ key: 'demo', revision: 3 }, { key: 'demo', revision: 3, aborted: true }), false);

// The browser API is same-origin; tests provide an origin without a browser.
Object.defineProperty(globalThis, 'window', { value: { location: { origin: 'http://localhost:3000' } }, configurable: true });
const pair = (productId: string, variantId: string) => ({ productId, variantId });
const resolved = (productId: string, variantId: string) => ({ productId, variantId, product: { id: productId, slug: productId, name: productId, description: '' }, variant: variant(variantId) });
let batches = 0;
const resolver: typeof fetch = async (_input, init) => {
  batches++;
  const lines = JSON.parse(String(init?.body)).lines as ReturnType<typeof pair>[];
  return json({ resolved: lines.filter(l => l.productId !== 'missing').map(l => resolved(l.productId, l.variantId)), missing: lines.filter(l => l.productId === 'missing') });
};
const result = await resolveCartPairs([pair('p1','shared'), pair('p2','shared'), pair('p1','shared'), pair('missing','v')], 'api', undefined, resolver);
assert.equal(batches, 1); assert.equal(result.resolved.length, 2); assert.deepEqual(result.missing, [pair('missing','v')]);
assert.equal((await resolveCartPairs([pair('ondas','coral'), pair('espiral','coral')], 'demo')).resolved.length, 2);
await assert.rejects(resolveCartPairs([pair('p1','v')], 'api', undefined, async () => json({ resolved: [], missing: [] })));
await assert.rejects(resolveCartPairs([pair('p1','v')], 'api', undefined, async () => json({ resolved: [resolved('p1','v')], missing: [pair('p1','v')] })));
const many = Array.from({ length: 101 }, (_, i) => pair(`p${i}`, 'v'));
let batchNo = 0;
await assert.rejects(resolveCartPairs(many, 'api', undefined, async (_input, init) => {
  batchNo++; if (batchNo === 2) throw new Error('offline');
  const lines = JSON.parse(String(init?.body)).lines as ReturnType<typeof pair>[];
  return json({ resolved: [], missing: lines });
})); // No partial successful partition is returned to the hook.

}
main().catch(error => { globalThis.console.error(error); globalThis.process.exitCode = 1; });
