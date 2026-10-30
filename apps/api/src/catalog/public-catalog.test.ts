import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicCatalog } from './public-catalog';
import { DataSource } from 'typeorm';

test('all public catalog reads fail clearly when database is unavailable', async () => {
  const catalog = new PublicCatalog();
  for (const operation of [catalog.list({}), catalog.detail('test'), catalog.settings()]) {
    await assert.rejects(operation, { status: 503 });
  }
});

test('detail exposes only the public fields and safe integer prices', async () => {
  const product = { id: 'p1', slug: 'pieza', name: 'Pieza', description: '', internalNote: 'secret' };
  const variant = { id: 'v1', productId: 'p1', name: 'Rojo', priceMinor: '12300', currency: 'ARS', supplyMode: 'stock', sku: 'PRIVATE' };
  let calls = 0;
  const fake = {
    isInitialized: true,
    getRepository: () => ++calls === 1 ? { findOneBy: async () => product } : { findAndCount: async () => [[variant], 1] },
  } as unknown as DataSource;
  assert.deepEqual(await new PublicCatalog(fake).detail('pieza'), {
    id: 'p1', slug: 'pieza', name: 'Pieza', description: '',
    variants: [{ id: 'v1', name: 'Rojo', priceMinor: 12300, currency: 'ARS', supplyMode: 'stock' }], page: 1, limit: 24, total: 1,
  });
});

test('detail requests only the selected variant page', async () => {
  const product = { id: 'p1', slug: 'pieza', name: 'Pieza', description: '' };
  let calls = 0;
  let paging: { skip: number; take: number } | undefined;
  const fake = {
    isInitialized: true,
    getRepository: () => ++calls === 1 ? { findOneBy: async () => product } : {
      findAndCount: async (options: { skip: number; take: number }) => { paging = options; return [[], 105]; },
    },
  } as unknown as DataSource;
  const result = await new PublicCatalog(fake).detail('pieza', { page: '2', limit: '50' });
  assert.equal(paging?.skip, 50);
  assert.equal(paging?.take, 50);
  assert.equal(result.total, 105);
});
