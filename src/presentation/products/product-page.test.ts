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
