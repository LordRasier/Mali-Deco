import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { listPublicProducts } from './public-listing';
import { PublicCartResolver } from '../cart/cart-resolver';
import { PublicCatalog } from '../services/public-catalog';

const image = { productId: 'p', id: 'i', alt: 'Imagen', width: 100, height: 200, path: 'secret' };
const expected = { id: 'i', alt: 'Imagen', width: 100, height: 200 };
test('listing and cart expose the same public primary image without disturbing ordering', async () => {
  const product = { id: 'p', slug: 'p', name: 'P', description: '', categoryId: null, categorySlug: null, categoryName: null, minPrice: null, maxPrice: null };
  const manager = { query: async (sql: string) => sql.includes('COUNT(*)') ? [{ total: 1 }] : sql.includes('FROM product_images') ? [image] : sql.includes('ROW_NUMBER()') ? [] : [product] };
  const db = { isInitialized: true, transaction: async (_: string, fn: (m: typeof manager) => unknown) => fn(manager), query: async (sql: string) => sql.includes('FROM product_images') ? [image] : [{ productId: 'p', productSlug: 'p', productName: 'P', productDescription: '', variantId: 'v', variantName: 'V', priceMinor: 1, currency: 'ARS', supplyMode: null, materialId: null, colorId: null }] } as unknown as DataSource;
  const listing = await listPublicProducts(db, {});
  assert.deepEqual(listing.items[0].primaryImage, expected);
  const cart = await new PublicCartResolver(db).resolve({ lines: [{ productId: 'p', variantId: 'v' }, { productId: 'missing', variantId: 'v' }] });
  assert.deepEqual(cart.resolved[0].product.primaryImage, expected);
  assert.deepEqual(cart.missing, [{ productId: 'missing', variantId: 'v' }]);
});

test('detail exposes only the public image fields', async () => {
  const db = { isInitialized: true, getRepository: () => ({ findOneBy: async () => ({ id: 'p', slug: 'p', name: 'P', description: '', categoryId: null }), findAndCount: async () => [[], 0] }), query: async () => [image] } as unknown as DataSource;
  const detail = await new PublicCatalog(db).detail('p');
  assert.deepEqual(detail.images, [expected]);
});
