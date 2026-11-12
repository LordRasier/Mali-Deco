import { effectiveVariantPriceSql } from './effective-price-sql';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { parseListingQuery } from './listing-query';
import { productOrder, productPredicate, variantPredicate } from './listing-sql';
import { listPublicProducts, selectedPublicProducts, publicVariant } from './public-listing';

test('featured-first sorting includes ordinary products and preserves the catalog default', () => {
  const query = parseListingQuery({ sort: 'featured_first' });
  assert.equal(productOrder(query.sort), 'p.featured DESC, p.name ASC, p.id ASC');
  assert.doesNotMatch(productPredicate(query).sql, /p.featured =/);
  assert.equal(productOrder(parseListingQuery({}).sort), 'p.name ASC, p.id ASC');
  for (const sort of [['featured_first'], 'featured_first; DROP TABLE products', true]) {
    assert.throws(() => parseListingQuery({ sort }), { status: 400 });
  }
});

test('featured priority is applied before pagination without broadening public or category eligibility', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const connection = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params }); return calls.length === 1 ? [{ total: 31 }] : [];
  } };
  const db = { transaction: async (_: string, run: (m: typeof connection) => unknown) => run(connection) } as unknown as DataSource;
  await listPublicProducts(db, { sort: 'featured_first', category: 'vases', page: '2', limit: '3' });
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /ORDER BY p.featured DESC, p.name ASC, p.id ASC LIMIT \? OFFSET \?/);
  assert.match(calls[1].sql, /p.status = 'active' AND p.archived_at IS NULL AND c.slug IN \(\?\)/);
  assert.doesNotMatch(calls[1].sql, /p.featured = 1/);
  assert.deepEqual(calls[1].params, ['vases', 3, 3]);
});

test('public variant prices and SQL price filters use active discounts consistently', () => {
  const variant = publicVariant({ id: 'v', name: 'Vase', productId: 'p', priceMinor: '10000', salePriceMinor: '7500', currency: 'ARS', supplyMode: null,
    materialId: null, materialSlug: null, materialName: null, colorId: null, colorSlug: null, colorName: null, colorHex: null });
  assert.equal(variant.priceMinor, 7500); assert.equal(variant.regularPriceMinor, 10000); assert.equal(variant.discountPercent, '25');
  const sql = variantPredicate(parseListingQuery({ currency: 'ARS', minPriceMinor: '7000', maxPriceMinor: '8000' })).sql;
  assert.equal((sql.match(/sale_price_minor < v.price_minor/g) ?? []).length, 2);
});

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
  assert.match(v.sql, /m\.slug IN \(\?, \?\) AND co\.slug IN \(\?, \?\) AND v\.currency = \?/);
  assert.ok(v.sql.endsWith(`${effectiveVariantPriceSql} >= ? AND ${effectiveVariantPriceSql} <= ?`));
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
    if (calls.length === 2) return [{ id: 'p1', slug: 'uno', name: 'Uno', description: '', productWidthMm: 125, productHeightMm: null, productLengthMm: 80, packageWidthMm: 999, categoryId: null, categorySlug: null, categoryName: null, minPrice: '100', maxPrice: '200' }];
    return [{ productId: 'p1', id: 'v2', name: 'Rojo', priceMinor: '100', currency: 'ARS', supplyMode: null, materialId: null, colorId: null }];
  } };
  const fake = { transaction: async (isolation: string, work: (value: typeof connection) => unknown) => { assert.equal(isolation, 'REPEATABLE READ'); return work(connection); } } as unknown as DataSource;
  const result = await listPublicProducts(fake, { currency: 'ARS', material: 'pla', color: 'red', sort: 'price_asc', page: '2', limit: '1' });
  assert.equal(result.total, 3);
  assert.deepEqual(result.items[0].priceRange, { currency: 'ARS', minMinor: 100, maxMinor: 200 });
  assert.equal(result.items[0].matchedVariant?.id, 'v2');
  assert.equal(result.items[0].matchedVariant?.material, null);
  assert.equal(result.items[0].productWidthMm, 125);
  assert.equal(result.items[0].productHeightMm, null);
  assert.equal(result.items[0].productLengthMm, 80);
  assert.equal('packageWidthMm' in result.items[0], false);
  assert.match(calls[1].sql, /p\.product_width_mm AS productWidthMm, p\.product_height_mm AS productHeightMm, p\.product_length_mm AS productLengthMm/);
  assert.match(calls[0].sql, /GROUP BY v\.product_id/);
  assert.match(calls[0].sql, /m\.slug IN \(\?\) AND co\.slug IN \(\?\) AND v\.currency = \?/);
  assert.match(calls[1].sql, /ORDER BY matched\.min_price ASC, p\.name ASC, p\.id ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(calls[1].params, ['pla', 'red', 'ARS', 1, 1]);
  assert.ok(calls[2].sql.includes(`ROW_NUMBER() OVER (PARTITION BY v.product_id ORDER BY ${effectiveVariantPriceSql} ASC, v.id ASC)`));
  assert.ok(calls[1].sql.includes(`MIN(${effectiveVariantPriceSql}) AS min_price, MAX(${effectiveVariantPriceSql}) AS max_price`));
  assert.deepEqual(calls[2].params, ['pla', 'red', 'ARS', 'p1']);
});

test('listing provides bounded eligible variants and ordered images for catalog interactions', async () => {
  const product = { id: 'p1', slug: 'uno', name: 'Uno', description: '', categoryId: null, categorySlug: null, categoryName: null, minPrice: '100', maxPrice: '200', variantCount: 2 };
  const variants = [{ productId: 'p1', id: 'v1', name: 'Azul', priceMinor: '100', currency: 'ARS', supplyMode: null, materialId: null, colorId: 'c1', colorSlug: 'azul', colorName: 'Azul', colorHex: '#123456' },
    { productId: 'p1', id: 'v2', name: 'Rojo', priceMinor: '200', currency: 'ARS', supplyMode: null, materialId: null, colorId: 'c2', colorSlug: 'rojo', colorName: 'Rojo', colorHex: '#ff0000' }];
  let count = 0;
  const connection = { query: async () => { count++; return count === 1 ? [{ total: 1 }] : count === 2 ? [product] : count === 3 ? variants : [{ productId: 'p1', id: 'i1', alt: '', width: 100, height: 100 }, { productId: 'p1', id: 'i2', alt: '', width: 100, height: 100 }]; } };
  const db = { transaction: async (_: string, run: (m: typeof connection) => unknown) => run(connection) } as unknown as DataSource;
  const item = (await listPublicProducts(db, { currency: 'ARS' })).items[0];
  assert.equal(item.variantCount, 2); assert.deepEqual(item.matchedVariants.map(v => v.id), ['v1', 'v2']);
  assert.deepEqual(item.images.map(image => image.id), ['i1', 'i2']); assert.equal(item.matchedVariant?.id, 'v1');
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
  assert.ok(calls.every(sql => !/MIN\(|MAX\(/.test(sql)));
});

test('manual landing selection keeps public visibility predicates, bounded IDs and requested order', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const connection = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (calls.length === 1) return [{ total: 2 }];
    if (calls.length === 2) return ['a', 'b'].map(id => ({ id, slug: id, name: id, description: '', categoryId: null, minPrice: null, maxPrice: null }));
    return [];
  } };
  const db = { transaction: async (_: string, run: (m: typeof connection) => unknown) => run(connection) } as unknown as DataSource;
  const page = await selectedPublicProducts(db, ['b', 'a']);
  assert.deepEqual(page.items.map(p => p.id), ['b', 'a']);
  assert.match(calls[0].sql, /p.status = 'active' AND p.archived_at IS NULL AND p.id IN \(\?,\?\)/);
  assert.deepEqual(calls[1].params, ['b', 'a', 24, 0]);
  await assert.rejects(selectedPublicProducts(db, ["' OR 1=1"]));
  await assert.rejects(selectedPublicProducts(db, Array(25).fill('a')));
});
