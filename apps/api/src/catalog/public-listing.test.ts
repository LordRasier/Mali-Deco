import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { parseListingQuery } from './listing-query';
import { productOrder, productPredicate, variantPredicate } from './listing-sql';
import { listPublicProducts } from './public-listing';

test('validates bounded filters, currency-safe prices, and exact query types', () => {
  const q = parseListingQuery({ category: 'jarrones,lamparas', material: 'pla,pla', color: 'rojo,azul', currency: 'ARS', minPriceMinor: '0', maxPriceMinor: '9007199254740991', sort: 'price_desc', page: '2', limit: '100' });
  assert.deepEqual(q.category, ['jarrones', 'lamparas']);
  assert.deepEqual(q.material, ['pla']);
  assert.equal(q.minPriceMinor, 0);
  for (const bad of [
    { category: '' }, { color: 'red,,blue' }, { material: Array(21).fill('x').join(',') },
    { category: 'x'.repeat(81) }, { color: ['red'] }, { currency: 'ars' },
    { minPriceMinor: '0' }, { sort: 'price_asc' }, { currency: 'ARS', minPriceMinor: '-1' },
    { currency: 'ARS', minPriceMinor: '9007199254740992' }, { currency: 'ARS', minPriceMinor: '2', maxPriceMinor: '1' },
    { sort: 'surprise' }, { page: '10001' }, { limit: '101' }, { currency: ['ARS'] }, { typo: 'red' },
  ]) assert.throws(() => parseListingQuery(bad), { status: 400 });
});

test('one variant predicate combines every variant-level constraint, with bounded placeholders', () => {
  const q = parseListingQuery({ category: 'unknown', material: 'pla,petg', color: 'red,blue', currency: 'ARS', minPriceMinor: '0', maxPriceMinor: '200' });
  const v = variantPredicate(q);
  assert.match(v.sql, /m\.slug IN \(\?, \?\) AND co\.slug IN \(\?, \?\) AND v\.currency = \? AND v\.price_minor >= \? AND v\.price_minor <= \?/);
  assert.deepEqual(v.params, ['pla', 'petg', 'red', 'blue', 'ARS', 0, 200]);
  const p = productPredicate(q);
  assert.match(p.sql, /c\.slug IN \(\?\)/);
  assert.match(p.sql, /matched\.product_id IS NOT NULL/);
  assert.deepEqual(p.params, ['unknown']);
  assert.equal(productOrder('price_asc'), 'matched.min_price ASC, p.name ASC, p.id ASC');
  assert.equal(productOrder('price_desc'), 'matched.min_price DESC, p.name ASC, p.id ASC');
  assert.equal(productOrder('name_desc'), 'p.name DESC, p.id ASC');
});

test('listing counts products, pages stably and returns only eligible representative/range', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (calls.length === 1) return [{ total: '3' }];
    if (calls.length === 2) return [{ id: 'p1', slug: 'uno', name: 'Uno', description: '', categoryId: null, categorySlug: null, categoryName: null, minPrice: '100', maxPrice: '200' }];
    return [{ productId: 'p1', id: 'v2', name: 'Rojo', priceMinor: '100', currency: 'ARS', supplyMode: null, materialId: null, colorId: null }];
  } };
  const fake = { transaction: async (isolation: string, work: (value: typeof connection) => unknown) => { assert.equal(isolation, 'REPEATABLE READ'); return work(connection); } } as unknown as DataSource;
  const result = await listPublicProducts(fake, { currency: 'ARS', material: 'pla', color: 'red', sort: 'price_asc', page: '2', limit: '1' });
  assert.equal(result.total, 3);
  assert.deepEqual(result.items[0].priceRange, { currency: 'ARS', minMinor: 100, maxMinor: 200 });
  assert.equal(result.items[0].matchedVariant?.id, 'v2');
  assert.equal(result.items[0].matchedVariant?.material, null);
  assert.match(calls[0].sql, /GROUP BY v\.product_id/);
  assert.match(calls[0].sql, /m\.slug IN \(\?\) AND co\.slug IN \(\?\) AND v\.currency = \?/);
  assert.match(calls[1].sql, /ORDER BY matched\.min_price ASC, p\.name ASC, p\.id ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(calls[1].params, ['pla', 'red', 'ARS', 1, 1]);
  assert.match(calls[2].sql, /ROW_NUMBER\(\) OVER \(PARTITION BY v\.product_id ORDER BY v\.price_minor ASC, v\.id ASC\)/);
  assert.deepEqual(calls[2].params, ['pla', 'red', 'ARS', 'p1']);
});

test('unknown category can return zero without broadening; no currency implies no range', async () => {
  const calls: string[] = [];
  const connection = { query: async (sql: string) => { calls.push(sql); return calls.length === 1 ? [{ total: 0 }] : []; } };
  const fake = { transaction: async (_isolation: string, work: (value: typeof connection) => unknown) => work(connection) } as unknown as DataSource;
  const result = await listPublicProducts(fake, { category: 'unknown' });
  assert.deepEqual(result, { items: [], page: 1, limit: 24, total: 0 });
  assert.equal(calls.length, 2);
});

test('unscoped requests never compare mixed-currency amounts', async () => {
  const calls: string[] = [];
  const connection = { query: async (sql: string) => { calls.push(sql); return calls.length === 1 ? [{ total: 0 }] : []; } };
  const fake = { transaction: async (_isolation: string, work: (value: typeof connection) => unknown) => work(connection) } as unknown as DataSource;
  await listPublicProducts(fake, {});
  assert.ok(calls.every(sql => !/MIN\(v\.price_minor\)|MAX\(v\.price_minor\)/.test(sql)));
});
