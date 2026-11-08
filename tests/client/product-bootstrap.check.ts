import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProductDetailResponse } from '../../src/presentation/shared/catalog/api-catalog';

const raw = () => ({ id: 'p1', slug: 'test-product', name: '<script>name</script>', description: 'Details', productWidthMm: null, productHeightMm: 100, productLengthMm: null,
  category: null, images: [], page: 1, limit: 100, total: 1,
  variants: [{ id: 'v1', name: 'Variant', priceMinor: 0, currency: 'ARS', supplyMode: null, material: null, color: null }] });

test('parses the same first-page contract used by network loading', () => {
  const parsed = parseProductDetailResponse(raw());
  assert.equal(parsed.product.name, '<script>name</script>'); assert.equal(parsed.product.variants[0].priceMinor, 0);
  assert.equal(parsed.product.variants[0].supplyMode, undefined); assert.equal(parsed.limit, 100);
});
test('rejects malformed bootstrap pagination and variant fields', () => {
  assert.throws(() => parseProductDetailResponse({ ...raw(), limit: 24 }));
  assert.throws(() => parseProductDetailResponse({ ...raw(), total: 2 }));
  const invalid = raw(); invalid.variants[0].currency = 'bad'; assert.throws(() => parseProductDetailResponse(invalid));
  const duplicate = raw(); duplicate.total = 2; duplicate.variants.push(duplicate.variants[0]); assert.throws(() => parseProductDetailResponse(duplicate));
});
