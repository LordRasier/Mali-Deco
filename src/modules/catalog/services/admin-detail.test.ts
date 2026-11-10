import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { CatalogAdmin } from './catalog-admin';

test('admin detail bounds and paginates variants even with 5000 records', async () => {
  const all = Array.from({ length: 5000 }, (_, index) => ({ id: `v${index}`, sku: `sku${index}` }));
  let options: { skip: number; take: number } | undefined;
  let calls = 0;
  const groups = [{ name: 'Diseño', value: 'Navidad' }, { name: 'Diseño', value: 'Año Nuevo' }];
  const db = { isInitialized: true, query: async (sql: string, params: string[]) => {
    assert.match(sql, /DISTINCT/); assert.match(sql, /archived_at IS NULL/); assert.match(sql, /LIMIT 501/);
    assert.deepEqual(params, ['p', 'p']); return groups;
  }, getRepository: () => ++calls === 1 ? { findOneBy: async () => ({ id: 'p', name: 'Pieza' }) } : {
    findAndCount: async (o: { skip: number; take: number }) => { options = o; return [all.slice(o.skip, o.skip + o.take), all.length]; },
  } } as unknown as DataSource;
  const result = await new CatalogAdmin(db).getProduct('p', { page: '2', limit: '100' });
  assert.equal(options?.skip, 100);
  assert.equal(options?.take, 100);
  assert.equal(result.variants.length, 100);
  assert.equal(result.total, 5000);
  assert.deepEqual(result.propertyCatalog, groups, 'property values include other variant pages without fetching full rows');
  await assert.rejects(new CatalogAdmin(db).getProduct('p', { limit: '101' }), { status: 400 });
});
