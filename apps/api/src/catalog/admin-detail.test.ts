import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { CatalogAdmin } from './catalog-admin';

test('admin detail bounds and paginates variants even with 5000 records', async () => {
  const all = Array.from({ length: 5000 }, (_, index) => ({ id: `v${index}`, sku: `sku${index}` }));
  let options: { skip: number; take: number } | undefined;
  let calls = 0;
  const db = { isInitialized: true, getRepository: () => ++calls === 1 ? { findOneBy: async () => ({ id: 'p', name: 'Pieza' }) } : {
    findAndCount: async (o: { skip: number; take: number }) => { options = o; return [all.slice(o.skip, o.skip + o.take), all.length]; },
  } } as unknown as DataSource;
  const result = await new CatalogAdmin(db).getProduct('p', { page: '2', limit: '100' });
  assert.equal(options?.skip, 100);
  assert.equal(options?.take, 100);
  assert.equal(result.variants.length, 100);
  assert.equal(result.total, 5000);
  await assert.rejects(new CatalogAdmin(db).getProduct('p', { limit: '101' }), { status: 400 });
});
