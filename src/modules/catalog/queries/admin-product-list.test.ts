import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { CatalogAdmin } from '../services/catalog-admin';
import type { ProductRow } from '../models/catalog.entities';
import { parseAdminProductListQuery, readAdminProductSummaries } from './admin-product-list';

test('list filters reject arrays, unknown enums and unbounded pagination before database access', async () => {
  for (const query of [{ status: ['active'] }, { status: 'published' }, { sort: 'price; DROP TABLE' }, { sort: ['name_asc'] }, { page: '10001' }, { limit: '101' }]) {
    assert.throws(() => parseAdminProductListQuery(query), { status: 400 });
    await assert.rejects(new CatalogAdmin().listProducts(query), { status: 400 });
  }
});

test('search binds literal name/SKU text and publication filters keep archived products separate', async () => {
  for (const status of ['active', 'draft', 'archived', 'all']) {
    const calls: [string, unknown, unknown?][] = [];
    const builder = {
      andWhere(sql: string, params?: unknown) { calls.push(['where', sql, params]); return this; },
      orderBy(column: string, direction: string) { calls.push(['order', column, direction]); return this; },
      addOrderBy(column: string, direction: string) { calls.push(['tie', column, direction]); return this; },
      skip(count: number) { calls.push(['skip', count]); return this; }, take(count: number) { calls.push(['take', count]); return this; },
      async getManyAndCount() { return [[], 0]; },
    };
    const db = { isInitialized: true, getRepository: () => ({ createQueryBuilder: () => builder }), query: async () => { throw Error('No summaries for an empty page'); } } as unknown as DataSource;
    await new CatalogAdmin(db).listProducts({ status, search: "SKU'_%", page: '2', limit: '24', sort: 'name_desc' });
    assert.match(String(calls[0][1]), /product_variants.*v\.archived_at IS NULL.*v\.sku/);
    assert.doesNotMatch(String(calls[0][1]), /SKU/); assert.deepEqual(calls[0][2], { search: "SKU'_%" });
    assert.ok(calls.some(call => call[0] === 'skip' && call[1] === 24));
    assert.ok(calls.some(call => call[0] === 'order' && call[2] === 'DESC'));
    if (status === 'archived') assert.match(String(calls[1][1]), /archivedAt IS NOT NULL/);
    else if (status !== 'all') { assert.match(String(calls[1][1]), /archivedAt IS NULL/); assert.deepEqual(calls[1][2], { status }); }
  }
});

test('summaries use two bounded metadata queries and preserve exact money and unavailable variants', async () => {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const db = { query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    return queries.length === 1 ? [{ productId: 'p1', variantCount: '3', stockVariants: '2', stockQuantity: '7', madeToOrder: '1', undefinedSupply: '0', currencyCount: '1', currency: 'ARS', minPrice: '9007199254740993', maxPrice: '9007199254740999', sku: 'ONE' }] : [{ productId: 'p1', id: 'cover' }];
  } };
  const products = [{ id: 'p1' }, { id: 'p2' }] as ProductRow[];
  const result = await readAdminProductSummaries(db, products);
  assert.equal(queries.length, 2); for (const query of queries) assert.deepEqual(query.params, ['p1', 'p2']);
  assert.match(queries[0].sql, /archived_at IS NULL/); assert.match(queries[0].sql, /CASE WHEN supply_mode = 'stock'/);
  assert.match(queries[1].sql, /retired_at IS NULL/); assert.match(queries[1].sql, /imageRank = 1/);
  assert.equal(result[0].listing?.minPrice, '9007199254740993'); assert.equal(result[0].listing?.stockQuantity, '7');
  assert.equal(result[0].listing?.imageId, 'cover'); assert.equal(result[1].listing?.variantCount, 0);
  assert.deepEqual(await readAdminProductSummaries(db, []), []); assert.equal(queries.length, 2);
});
