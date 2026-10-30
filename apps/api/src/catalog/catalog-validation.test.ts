import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalogQuery, validateProduct } from './catalog-validation';

test('pagination is bounded and search is trimmed', () => {
  assert.deepEqual(parseCatalogQuery({ page: '2', limit: '20', search: ' pieza ' }), { page: 2, limit: 20, search: 'pieza' });
  assert.throws(() => parseCatalogQuery({ page: '1.5' }));
  assert.throws(() => parseCatalogQuery({ limit: '101' }));
  assert.throws(() => parseCatalogQuery({ search: 'x'.repeat(101) }));
});

test('description respects the MySQL TEXT byte limit with multibyte input', () => {
  const product = { name: 'Pieza', slug: 'pieza', description: 'é'.repeat(32767), status: 'draft' as const };
  assert.doesNotThrow(() => validateProduct(product));
  assert.throws(() => validateProduct({ ...product, description: 'é'.repeat(32768) }));
});

test('product requires valid slug and positive integer dimensions if provided', () => {
  const product = { name: 'Pieza', slug: 'pieza-3d', description: '', status: 'draft' as const };
  assert.doesNotThrow(() => validateProduct(product));
  assert.throws(() => validateProduct({ ...product, slug: 'Pieza 3D' }));
  assert.throws(() => validateProduct({ ...product, productWeightG: 0 }));
  assert.throws(() => validateProduct({ ...product, packageWidthMm: 1.5 }));
});
