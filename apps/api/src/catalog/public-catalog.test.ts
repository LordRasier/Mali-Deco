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
    id: 'p1', slug: 'pieza', name: 'Pieza', description: '', productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null,
    variants: [{ id: 'v1', name: 'Rojo', priceMinor: 12300, currency: 'ARS', supplyMode: 'stock', material: null, color: null }], page: 1, limit: 24, total: 1,
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

test('detail resolves only persisted public taxonomy for the bounded variant page', async () => {
  const product = { id: 'p1', slug: 'pieza', name: 'Pieza', description: '', categoryId: 'c1' };
  const variants = [{ id: 'v1', productId: 'p1', name: 'Rojo', priceMinor: '123', currency: 'ARS', supplyMode: null, materialId: 'm1', colorId: 'z1' }];
  let calls = 0;
  const queried: string[] = [];
  const fake = {
    isInitialized: true,
    getRepository: () => ++calls === 1 ? { findOneBy: async () => product } : { findAndCount: async () => [variants, 1] },
    query: async (sql: string, ids: string[]) => {
      queried.push(sql);
      if (ids[0] === 'c1') return [{ id: 'c1', slug: 'decoracion', name: 'Decoración' }];
      if (ids[0] === 'm1') return [{ id: 'm1', slug: 'pla', name: 'PLA' }];
      return [{ id: 'z1', slug: 'rojo', name: 'Rojo', hex: '#FF0000' }];
    },
  } as unknown as DataSource;
  const result = await new PublicCatalog(fake).detail('pieza');
  assert.equal(result.category?.slug, 'decoracion');
  assert.equal(result.variants[0].material?.slug, 'pla');
  assert.equal(result.variants[0].color?.hex, '#FF0000');
  assert.ok(queried.every(sql => sql.includes('archived_at IS NULL')));
});

test('detail exposes only product dimensions, including partial measurements', async () => {
  const product = { id: 'p1', slug: 'pieza', name: 'Pieza', description: '', productWidthMm: 120, productHeightMm: null, productLengthMm: 80, productWeightG: 111, packageWidthMm: 999, packageWeightG: 400 };
  const variants = [{ id: 'v1', productId: 'p1', name: 'Rojo', priceMinor: '123', currency: 'ARS', supplyMode: null, sku: 'PRIVATE' }];
  let calls = 0;
  const fake = {
    isInitialized: true,
    getRepository: () => ++calls === 1 ? { findOneBy: async () => product } : { findAndCount: async () => [variants, 1] },
  } as unknown as DataSource;
  const result = await new PublicCatalog(fake).detail('pieza');
  assert.deepEqual(result, {
    id: 'p1', slug: 'pieza', name: 'Pieza', description: '', category: null, productWidthMm: 120, productHeightMm: null, productLengthMm: 80,
    variants: [{ id: 'v1', name: 'Rojo', priceMinor: 123, currency: 'ARS', supplyMode: null, material: null, color: null }], page: 1, limit: 24, total: 1,
  });
});
