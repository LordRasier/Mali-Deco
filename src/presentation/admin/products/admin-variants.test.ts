import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ProductRow, VariantRow } from '../../../modules/catalog/models/catalog.entities';
import { AdminProductsPage } from './admin-products-page';
import { variantListModel } from './admin-variants-model';
import { createViewEngine } from '../../view-engine';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const product: ProductRow = { id: 'p1', name: 'Product', slug: 'product', description: '', status: 'active', archivedAt: null, categoryId: null,
  productWeightG: null, productWidthMm: null, productHeightMm: null, productLengthMm: null, packageWeightG: null, packageWidthMm: null, packageHeightMm: null, packageLengthMm: null };
const variant: VariantRow = { id: 'v1', productId: 'p1', sku: 'SKU', name: 'Variant', priceMinor: '12345', currency: 'ARS', supplyMode: null,
  archivedAt: null, materialId: 'm1', colorId: 'c1' };
function fixture() {
  const calls: unknown[] = []; let row = { ...variant }, parent = { ...product };
  const page = new AdminProductsPage({ listProducts: async () => ({ items: [], page: 1, limit: 24, total: 0 }),
    getProduct: async (id, query) => { calls.push([id, query]); return { ...parent, variants: [row], page: Number(query?.page), limit: 24, total: 49 }; } });
  return { calls, page, variant(value: Partial<VariantRow>) { row = { ...row, ...value }; }, product(value: Partial<ProductRow>) { parent = { ...parent, ...value }; } };
}

test('variant table groups property values and renders only scoped image URLs', () => {
  const view = variantListModel(product, [{ ...variant, imageId: 'image', materialName: 'PLA', colorName: 'Azul', options: [{ name: 'Tamaño', value: 'Grande' }] }], 1);
  assert.equal(view.hasVariants, true);
  assert.equal(view.variants[0].imageUrl, '/api/v1/admin/catalog/products/p1/images/image/content?w=320');
  assert.deepEqual(view.properties, [{ name: 'Material', values: ['PLA'] }, { name: 'Color', values: ['Azul'] }, { name: 'Tamaño', values: ['Grande'] }]);
});

test('a replacement simple price never reuses an archived SKU, and can still be personalized or kept', async () => {
  const archived = { ...variant, name: 'Estándar', sku: 'MD-P1', archivedAt: new Date(), colorId: null, materialId: null };
  const replacement = variantListModel(product, [archived], 1);
  assert.equal(replacement.simpleAvailable, true); assert.equal(replacement.simpleSku, 'MD-P1-2');
  const current = { ...archived, id: 'v2', archivedAt: null, sku: replacement.simpleSku };
  const options = variantListModel(product, [archived, current], 2);
  assert.equal(options.simpleId, 'v2');
  const html = await new Promise<string>((resolve, reject) => createViewEngine({ admin_product_images: '' }).__express(
    join(__dirname, '..', 'views', 'admin-product-form.hbs'), { ...options, layout: false, editing: true, product }, (error, text) => error ? reject(error) : resolve(text!)));
  assert.match(html, /data-product-action="variant-edit" data-variant-id="v2"/);
  assert.match(html, /data-pricing-form[^>]*data-variant-id="v2"/);
  assert.match(html, /data-product-action="variant-create" data-first-variant="v2">Agregar variantes/);
});

test('detail variants retain page24 navigation, exact minor prices and archived mutation rules', async () => {
  const f = fixture(), result = await f.page.read({ view: 'detail', id: 'p1', page: '2' });
  assert.deepEqual(f.calls, [['p1', { page: '2', limit: '24' }]]);
  assert.equal(result.model.variantPage, 2); assert.equal(result.model.variantPages, 3);
  assert.equal(result.model.variants[0].priceMinor, '12345'); assert.equal(result.model.variants[0].supplyLabel, 'Sin definir');
  assert.equal(result.model.variants[0].editable, true);
  f.variant({ archivedAt: new Date() }); assert.equal((await f.page.read({ view: 'detail', id: 'p1' })).model.variants[0].editable, false);
  f.product({ archivedAt: new Date() }); assert.equal((await f.page.read({ view: 'detail', id: 'p1' })).model.variants[0].editable, false);
});

test('variant editors use exact currency precision, preserve assignments and do not invent supply mode', async () => {
  const f = fixture();
  const edit = await f.page.read({ view: 'variant-edit', id: 'p1', variantId: 'v1', page: '2' });
  assert.equal(edit.view, 'admin-variant-form'); assert.equal(edit.model.variant.price, '123.45');
  assert.equal(edit.model.variant.materialId, 'm1'); assert.equal(edit.model.variant.colorId, 'c1'); assert.equal(edit.model.supplyUnset, true);
  f.variant({ currency: 'JPY', priceMinor: '123' }); assert.equal((await f.page.read({ view: 'variant-edit', id: 'p1', variantId: 'v1' })).model.variant.price, '123');
  const create = await f.page.read({ view: 'variant-create', id: 'p1' }); assert.equal(create.model.variant.price, ''); assert.equal(create.model.variant.currency, 'ARS');
  assert.equal(create.model.supplyUnset, true);
});

test('missing/off-page and archived variants cannot open an editor or trigger scans', async () => {
  const f = fixture(); await assert.rejects(f.page.read({ view: 'variant-edit', id: 'p1', variantId: 'other', page: '2' }), NotFoundException);
  assert.equal(f.calls.length, 1);
  f.variant({ archivedAt: new Date() }); await assert.rejects(f.page.read({ view: 'variant-edit', id: 'p1', variantId: 'v1' }), NotFoundException);
  f.product({ archivedAt: new Date() }); await assert.rejects(f.page.read({ view: 'variant-create', id: 'p1' }), NotFoundException);
  await assert.rejects(f.page.read({ view: 'variant-edit', id: 'p1' }), BadRequestException);
  await assert.rejects(f.page.read({ view: 'variant-create', id: 'p1', variantId: 'v1' }), BadRequestException);
});

test('variant form is server-rendered with safe native fallback, exact money and independent selectors', async () => {
  const result = await fixture().page.read({ view: 'variant-edit', id: 'p1', variantId: 'v1', page: '2' });
  const html = await new Promise<string>((resolve, reject) => createViewEngine({ admin_product_images: readFileSync(join(__dirname, '..', 'views', 'admin-product-images.hbs'), 'utf8') }).__express(join(__dirname, '..', 'views', `${result.view}.hbs`), result.model,
    (error, html) => error ? reject(error) : resolve(html!)));
  assert.match(html, /data-product-view="variant-edit"/); assert.match(html, /data-product-page="2"/);
  assert.match(html, /data-variant-form[^>]*method="post"/); assert.match(html, /name="price"[^>]*value="123\.45"/);
  for (const name of ['sku', 'name', 'currency', 'supplyMode', 'materialId', 'colorId']) assert.ok(html.includes(`name="${name}"`));
  assert.match(html, /value="" selected/); assert.doesNotMatch(html, /inventario|reservar stock/i);
});
