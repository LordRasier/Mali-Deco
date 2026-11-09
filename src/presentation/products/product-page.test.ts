import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { ProductPage } from './product-page';

function fixture() {
  const calls: unknown[] = [];
  return { calls, catalog: {
    settings: async () => ({ name: 'Synthetic store' }),
    detail: async (slug: string, query?: Record<string, unknown>) => {
      calls.push([slug, query]); return { id: 'p1', slug, name: '</script><script>bad</script>', description: 'Public description', bulkWarningThreshold: null, bulkWarningMessage: null,
        productWidthMm: null, productHeightMm: 50, productLengthMm: null, images: [], category: null,
        variants: [{ id: 'v1', name: 'Variant', priceMinor: 0, currency: 'ARS', supplyMode: null, stockQuantity: 0, material: null, color: null }], page: 1, limit: 100, total: 1 };
    },
  } };
}
test('SSR product explicitly requests the first hundred variants and emits only public bootstrap data', async () => {
  const f = fixture(), result = await new ProductPage(f.catalog, 'api').read('product');
  assert.equal(result.status, 200); assert.equal(result.model.ready, true);
  assert.deepEqual(f.calls, [['product', { page: '1', limit: '100' }]]);
  const raw = JSON.parse(result.model.bootstrap); assert.equal(raw.variants[0].priceMinor, 0); assert.equal(raw.total, 1);
  assert.equal(result.model.dimensions.height, '50 mm'); assert.equal(result.model.dimensions.width, 'No informado');
});
test('settings 404 is unavailable and never mistaken for missing product', async () => {
  const f = fixture(); f.catalog.settings = async () => { throw new NotFoundException('private settings error'); };
  const result = await new ProductPage(f.catalog, 'api').read('product');
  assert.equal(result.status, 503); assert.equal(result.model.ready, false); assert.deepEqual(f.calls, []);
  assert.equal(result.model.retry, true);
  assert.doesNotMatch(JSON.stringify(result.model), /private settings/);
});
test('API canonical metadata uses only a valid configured public origin; demo stays noncanonical', async () => {
  const f = fixture();
  const ready = await new ProductPage(f.catalog, 'api', { PUBLIC_SITE_URL: 'https://shop.example/' }).read('product');
  assert.equal(ready.model.canonical, 'https://shop.example/productos/product');
  const invalid = await new ProductPage(f.catalog, 'api', { PUBLIC_SITE_URL: 'https://shop.example/subpath' }).read('product');
  assert.equal(invalid.model.canonical, '');
  const demo = await new ProductPage(f.catalog, 'demo', { PUBLIC_SITE_URL: 'https://shop.example/' }).read('florero-ondas');
  assert.equal(demo.model.canonical, '');
});
test('only product lookup 404 is absence; other failures stay unavailable', async () => {
  const f = fixture(); f.catalog.detail = async () => { throw new NotFoundException(); };
  assert.equal((await new ProductPage(f.catalog, 'api').read('missing')).status, 404);
  f.catalog.detail = async () => { throw Error('private database failure'); };
  const failed = await new ProductPage(f.catalog, 'api').read('product'); assert.equal(failed.status, 503); assert.equal(failed.model.demo, false);
  assert.doesNotMatch(JSON.stringify(failed.model), /private database/);
});
test('explicit demo is isolated and preserves illustrative image and missing dimension labels', async () => {
  const f = fixture(), page = new ProductPage(f.catalog, 'demo');
  const result = await page.read('florero-ondas');
  assert.equal(result.status, 200); assert.equal(result.model.images[0].illustration, true);
  assert.equal(result.model.dimensions.width, 'No disponible en esta vista'); assert.deepEqual(f.calls, []);
  assert.equal((await page.read('unknown')).status, 404);
});

test('SSR resolves a linked variant beyond the first page and never substitutes a missing one', async () => {
  const f = fixture(), initial = await f.catalog.detail('product');
  f.catalog.detail = async () => ({ ...initial, total: 101 });
  const resolver = { resolve: async (body: unknown) => {
    assert.deepEqual(body, { lines: [{ productId: 'p1', variantId: 'v101' }] });
    return { resolved: [{ productId: 'p1', variantId: 'v101', product: { id: 'p1', slug: 'product', name: 'Product', description: '', bulkWarningThreshold: null, bulkWarningMessage: null, primaryImage: null },
      variant: { ...initial.variants[0], id: 'v101', name: 'Extra', priceMinor: 12345, supplyMode: 'stock' as const, stockQuantity: 3 } }], missing: [] };
  } };
  const result = await new ProductPage(f.catalog, 'api', {}, undefined, resolver).read('product', new URLSearchParams('variant=v101'));
  assert.equal(result.status, 200); assert.equal(result.model.selectedVariantId, 'v101'); assert.equal(result.model.selectedName, 'Extra');
  assert.match(result.model.priceLabel, /123,45/); assert.equal(result.model.availability, 'En stock'); assert.equal(result.model.noindex, false);
  assert.equal(result.model.productDetail?.variants.at(-1)?.id, 'v101');
  const missing = await new ProductPage(f.catalog, 'api', {}, undefined, { resolve: async () => ({ resolved: [], missing: [{ productId: 'p1', variantId: 'absent' }] }) }).read('product', new URLSearchParams('variant=absent'));
  assert.equal(missing.status, 200); assert.equal(missing.model.noindex, true); assert.equal(missing.model.selectedVariantId, undefined);
});
