import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApiCatalog } from '../src/lib/api-catalog.ts';

const base = 'http://localhost:3001/api/v1';
const product = n => ({ id: `p${n}`, slug: `product-${n}`, name: `Producto ${n}`, description: '' });
const variant = n => ({ id: `v${n}`, name: `Variante ${n}`, priceMinor: n * 100, currency: 'ARS', supplyMode: null });
const json = value => new globalThis.Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('loads published settings, every product and variant page without invented image or color', async () => {
  const requested = [];
  const fetcher = async url => {
    requested.push(url.toString());
    const path = url.pathname;
    if (path.endsWith('/settings')) return json({ name: 'Marca' });
    const page = Number(url.searchParams.get('page'));
    if (path.endsWith('/products')) {
      const products = Array.from({ length: 101 }, (_, i) => product(i));
      return json({ items: products.slice((page - 1) * 100, page * 100), page, limit: 100, total: 101 });
    }
    const n = Number(path.match(/product-(\d+)$/)[1]);
    const variants = Array.from({ length: n === 0 ? 101 : 1 }, (_, i) => variant(i + 1));
    return json({ ...product(n), variants: variants.slice((page - 1) * 100, page * 100), page, limit: 100, total: variants.length });
  };
  const result = await loadApiCatalog(base, fetcher);
  assert.equal(result.brand, 'Marca');
  assert.equal(result.mode, 'api');
  assert.equal(result.products.length, 101);
  assert.equal(result.products[0].variants.length, 101);
  assert.equal(result.products[0].image, undefined);
  assert.equal(result.products[0].variants[0].color, undefined);
  assert.equal(result.products[0].variants[0].priceMinor, 100);
  assert.ok(requested.some(url => url.endsWith('/catalog/products?page=2&limit=100')));
  assert.ok(requested.some(url => url.endsWith('/catalog/products/product-0?page=2&limit=100')));
});

test('does not substitute demo content for errors or malformed prices', async () => {
  await assert.rejects(loadApiCatalog(base, async () => new globalThis.Response('', { status: 503 })), /HTTP 503/);
  await assert.rejects(loadApiCatalog(base, async () => { throw new Error('offline'); }), /unavailable/);
  const fetcher = async url => {
    if (url.pathname.endsWith('/settings')) return json({ name: 'Marca' });
    if (url.pathname.endsWith('/products')) return json({ items: [product(1)], page: 1, limit: 100, total: 1 });
    return json({ ...product(1), variants: [{ ...variant(1), priceMinor: -1 }], page: 1, limit: 100, total: 1 });
  };
  await assert.rejects(loadApiCatalog(base, fetcher), /price/);
});

test('fails explicitly instead of truncating a catalog over the safety bound', async () => {
  const fetcher = async url => url.pathname.endsWith('/settings') ? json({ name: 'Marca' }) : json({ items: [], page: 1, limit: 100, total: 1001 });
  await assert.rejects(loadApiCatalog(base, fetcher), /supported limit/);
});
