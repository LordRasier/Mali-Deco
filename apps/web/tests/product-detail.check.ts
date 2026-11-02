import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductNotFound from '../src/app/productos/not-found';
import { parseVariantQuery, resolveRequestedVariant } from '../src/lib/product-selection';
import { CatalogHttpError, catalogRequest, fetchProductDetail } from '../src/lib/api-catalog';
import { canonicalProductUrl, loadProductPage } from '../src/lib/product-page';

async function main() {
const missingPage = renderToStaticMarkup(createElement(ProductNotFound));
assert.match(missingPage, /No encontramos este producto/);
assert.match(missingPage, /href="\/catalogo"/);
const valid = { id: 'v1', name: 'Azul', priceMinor: 100, currency: 'ARS' };
assert.deepEqual(parseVariantQuery(new URLSearchParams()), { kind: 'none' });
assert.deepEqual(parseVariantQuery(new URLSearchParams('variant=v1')), { kind: 'id', id: 'v1' });
for (const query of ['variant=', 'variant=v1&variant=v2', 'variant=%20']) {
  assert.equal(parseVariantQuery(new URLSearchParams(query)).kind, 'invalid');
}
const resolve = async () => ({ resolved: [{ productId: 'p1', variantId: 'v101', product: { id:'p1',slug:'p1',name:'P',description:'',variants:[] }, variant: { ...valid, id:'v101' } }], missing: [] });
assert.equal((await resolveRequestedVariant('p1', [valid], { kind:'id', id:'v101' }, 'api', undefined, resolve)).variant?.id, 'v101');
const missing = async () => ({ resolved: [], missing: [{ productId:'p1', variantId:'other' }] });
assert.equal((await resolveRequestedVariant('p1', [valid], { kind:'id', id:'other' }, 'api', undefined, missing)).variant, null);
await assert.rejects(resolveRequestedVariant('p1', [valid], { kind:'id', id:'v101' }, 'api', undefined, async () => { throw new Error('offline'); }));
await assert.rejects(catalogRequest('http://localhost:3001/', 'catalog/products/x', {}, async () => new Response('{}', { status: 404 })), error => error instanceof CatalogHttpError && error.status === 404);
const base = 'http://localhost:3001/api/v1/';
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const detail = { id:'p1', slug:'p1', name:'Pieza', description:'', category:null, productWidthMm: 120, productHeightMm: null, productLengthMm: 80, variants: [], page:1, limit:100, total:0 };
const parsed = await fetchProductDetail(base, 'p1', 1, undefined, async () => response(detail));
assert.equal(parsed.product.productWidthMm, 120); assert.equal(parsed.product.productHeightMm, null);
await assert.rejects(fetchProductDetail(base, 'p1', 1, undefined, async () => response({ ...detail, productLengthMm: 0 })));
const originalFetch = globalThis.fetch, oldMode = process.env.STOREFRONT_MODE, oldBase = process.env.API_BASE_URL;
process.env.STOREFRONT_MODE = 'api'; process.env.API_BASE_URL = base;
try {
  globalThis.fetch = async input => String(input).endsWith('/settings') ? response({ name:'Marca' }) : response({}, 404);
  assert.equal((await loadProductPage('ausente')).kind, 'missing');
  globalThis.fetch = async input => String(input).endsWith('/settings') ? response({ name:'Marca' }) : response({}, 503);
  assert.equal((await loadProductPage('p1')).kind, 'unavailable');
  globalThis.fetch = async () => response({}, 404);
  assert.equal((await loadProductPage('p1')).kind, 'unavailable');
  globalThis.fetch = async input => String(input).endsWith('/settings') ? response({ name:'Marca' }) : new Response('{', { status: 200 });
  assert.equal((await loadProductPage('p1')).kind, 'unavailable');
  globalThis.fetch = async input => String(input).endsWith('/settings') ? response({ name:'Marca' }) : response(detail);
  assert.equal((await loadProductPage('p1')).kind, 'ready');
} finally {
  globalThis.fetch = originalFetch;
  if (oldMode === undefined) delete process.env.STOREFRONT_MODE; else process.env.STOREFRONT_MODE = oldMode;
  if (oldBase === undefined) delete process.env.API_BASE_URL; else process.env.API_BASE_URL = oldBase;
}
assert.equal(canonicalProductUrl(undefined, 'pieza'), undefined);
assert.equal(canonicalProductUrl('https://shop.example/', 'pieza'), 'https://shop.example/productos/pieza');
assert.equal(canonicalProductUrl('https://shop.example/subpath', 'pieza'), undefined);
console.log('product selection and HTTP errors OK');

}
main().catch(error => { globalThis.console.error(error); globalThis.process.exitCode = 1; });
