import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminProductsPage } from './admin-products-page';
import { AdminPage } from '../admin-page';
import type { ProductRow } from '../../../modules/catalog/models/catalog.entities';
import { join } from 'node:path';
import { createViewEngine } from '../../view-engine';
import { readFileSync } from 'node:fs';
import { productListItem } from './admin-product-list-model';
import type { ProductListSummary } from '../../../modules/catalog/queries/admin-product-list';

const product: ProductRow = { id: 'p1', name: '<script>Product</script>', slug: 'product', description: 'Description', status: 'active', archivedAt: null,
  categoryId: 'category-1', productWeightG: 100, productWidthMm: 20, productHeightMm: null, productLengthMm: null,
  packageWeightG: null, packageWidthMm: null, packageHeightMm: null, packageLengthMm: null };
function fixture() {
  const calls: unknown[] = [];
  return { calls, catalog: {
    listProducts: async (query: Record<string, unknown>) => { calls.push(['list', query]); return { items: [product], page: Number(query.page), limit: 24, total: 25 }; },
    getProduct: async (id: string, query?: Record<string, unknown>) => { calls.push(['detail', id, query]); return { ...product, id, variants: [], page: 1, limit: 24, total: 0 }; },
  } };
}

test('product list uses the existing service with bounded pagination and safe explicit view models', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog), result = await page.read({ page: '2', search: ' Product ' });
  assert.equal(result.view, 'admin-products-list'); assert.equal(result.model.section, 'products');
  assert.deepEqual(f.calls, [['list', { page: '2', limit: '24', search: 'Product' }]]);
  assert.equal(result.model.items[0].name, product.name); assert.equal(result.model.hasPrevious, true); assert.equal(result.model.hasNext, false);
});

test('product list forwards filters and sorting, and rejects malformed values before service reads', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog);
  const result = await page.read({ status: 'draft', sort: 'name_desc', search: 'SKU' });
  assert.deepEqual(f.calls, [['list', { page: '1', limit: '24', search: 'SKU', status: 'draft', sort: 'name_desc' }]]);
  assert.ok('hasFilters' in result.model && 'listStatus' in result.model);
  assert.equal(result.model.hasFilters, true); assert.equal(result.model.listStatus, 'draft');
  for (const query of [{ status: ['draft'] }, { status: 'secret' }, { sort: 'price_asc' }]) await assert.rejects(page.read(query), BadRequestException);
  assert.equal(f.calls.length, 1);
});

test('list presents exact prices, mixed availability, empty stock and safe private thumbnail URLs', () => {
  const listing: ProductListSummary = { variantCount: 2, sku: 'SKU', stockVariants: 1, stockQuantity: '3', madeToOrder: 1, undefinedSupply: 0,
    currencyCount: 1, currency: 'ARS', minPrice: '12345', maxPrice: '18000', imageId: 'cover' };
  const row = productListItem({ ...product, listing });
  assert.equal(row.variantLabel, '2 variantes'); assert.equal(row.stockLabel, '3 unidades'); assert.equal(row.availability, 'También a pedido');
  assert.match(row.priceLabel, /^Desde.*123,45/); assert.equal(row.outOfStock, false);
  assert.match(row.imageUrl, /^\/api\/v1\/admin\/catalog\/products\/p1\/images\/cover\/content\?w=320$/);
  assert.equal(productListItem({ ...product, listing: { ...listing, currencyCount: 2 } }).priceLabel, 'Varias monedas');
  const empty = productListItem({ ...product, listing: { ...listing, madeToOrder: 0, stockQuantity: '0' } });
  assert.equal(empty.stockLabel, '0 unidades'); assert.equal(empty.outOfStock, true);
  assert.equal(productListItem({ ...product, listing: { ...listing, stockVariants: 0 } }).stockLabel, 'A pedido');
  assert.equal(productListItem({ ...product, archivedAt: new Date(), listing }).publicUrl, '');
  assert.equal(productListItem({ ...product, listing: { ...listing, variantCount: 0 } }).priceLabel, 'Sin precio');
});

test('create requires no reads; detail/edit use the requested product and do not enable edits for archived products', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog);
  const create = await page.read({ view: 'create' }); assert.equal(create.view, 'admin-product-form'); assert.deepEqual(f.calls, []);
  assert.equal(create.model.editing, false); assert.equal(create.model.product.status, 'draft');
  const edit = await page.read({ view: 'edit', id: 'p1' }); assert.equal(edit.view, 'admin-product-form'); assert.equal(edit.model.editing, true);
  assert.equal(edit.model.product.categoryId, 'category-1'); assert.equal(edit.model.dimensions[0].fields[0].value, '100');
  assert.equal(edit.model.dimensions[0].fields[1].label, 'Ancho (cm)');
  assert.equal(edit.model.dimensions[0].fields[1].value, '2');
  assert.equal(edit.model.dimensions[0].fields[1].inputMode, 'decimal');
  assert.equal(edit.model.dimensions[1].fields[1].label, 'Ancho (cm)');
  assert.equal(edit.model.dimensions[1].fields[1].value, '');
  assert.deepEqual(f.calls[0], ['detail', 'p1', { page: '1', limit: '24' }]);
  f.catalog.getProduct = async id => ({ ...product, id, archivedAt: new Date(), variants: [], page: 1, limit: 24, total: 0 });
  await assert.rejects(page.read({ view: 'edit', id: 'p1' }), NotFoundException);
  assert.equal((await page.read({ view: 'detail', id: 'p1' })).model.archived, true);
});

test('product views reject unknown, repeated and cross-view query values before catalog access', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog);
  for (const query of [{ layout: 'secret' }, { view: ['list', 'edit'] }, { view: 'unknown' }, { page: '0' }, { page: '10001' },
    { search: 'x'.repeat(101) }, { view: 'detail' }, { view: 'edit', id: ['p1'] }, { view: 'create', id: 'p1' }, { id: 'p1' }, { limit: '100' }]) {
    await assert.rejects(page.read(query), BadRequestException);
  }
  assert.deepEqual(f.calls, []);
});

test('administrative section authorization happens before product query parsing or service reads', async () => {
  const f = fixture(), products = new AdminProductsPage(f.catalog);
  const denied = new AdminPage({ me: async () => ({ user: { id: 'op', email: 'op@example.invalid', role: 'operations' } }) }, { products });
  assert.equal((await denied.section('token', 'products', { view: 'list' })).status, 403); assert.deepEqual(f.calls, []);
  const allowed = new AdminPage({ me: async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' } }) }, { products });
  const result = await allowed.section('token', 'products', {}); assert.equal(result.status, 200); assert.equal(result.view, 'admin-products-list');
  assert.equal((await allowed.section('token', 'products', { layout: 'secret' })).status, 400);
  f.catalog.listProducts = async () => { throw Error('private SQL credentials'); };
  const outage = await allowed.section('token', 'products', {}); assert.equal(outage.status, 503); assert.doesNotMatch(JSON.stringify(outage), /private SQL/);
});

test('server templates escape product values, render complete forms and omit archived mutation controls', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog), engine = createViewEngine({ admin_product_images: readFileSync(join(__dirname, '..', 'views', 'admin-product-images.hbs'), 'utf8') });
  const render = async (query: Record<string, unknown>) => {
    const result = await page.read(query);
    return new Promise<string>((resolve, reject) => engine.__express(join(__dirname, '..', 'views', `${result.view}.hbs`), result.model,
      (error, html) => error ? reject(error) : resolve(html!)));
  };
  const listing = await render({}); assert.match(listing, /data-product-view="list"/); assert.match(listing, /&lt;script&gt;Product/); assert.doesNotMatch(listing, /<script>Product/);
  assert.match(listing, /class="admin-main product-list"/); assert.match(listing, /data-product-status="active"/);
  assert.match(await render({ view: 'list', search: 'florero' }), /data-product-action="clear-filters"/);
  const form = await render({ view: 'edit', id: 'p1' }); assert.match(form, /data-product-form[^>]*method="post"[^>]*action="\/admin"/); assert.match(form, /name="categoryId"/);
  for (const name of ['name', 'slug', 'description', 'status', 'productWeightG', 'productWidthMm', 'productHeightMm', 'productLengthMm', 'packageWeightG', 'packageWidthMm', 'packageHeightMm', 'packageLengthMm']) assert.ok(form.includes(`name="${name}"`), name);
  assert.match(await render({ view: 'detail', id: 'p1' }), /data-product-action="archive"/);
  f.catalog.getProduct = async id => ({ ...product, id, archivedAt: new Date(), variants: [], page: 1, limit: 24, total: 0 });
  const archived = await render({ view: 'detail', id: 'p1' }); assert.doesNotMatch(archived, /data-product-action="(?:archive|edit)"/);
  assert.match(archived, /archivado/i);
});

test('product list distinguishes an empty catalog, an empty search and an out-of-range page', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog), engine = createViewEngine({});
  const render = async (query: Record<string, unknown>) => {
    const result = await page.read(query);
    return new Promise<string>((resolve, reject) => engine.__express(join(__dirname, '../views/admin-products-list.hbs'), result.model,
      (error, html) => error ? reject(error) : resolve(html!)));
  };
  f.catalog.listProducts = async query => ({ items: [], page: Number(query.page), limit: 24, total: 0 });
  const empty = await render({}); assert.match(empty, /Todavía no hay productos/); assert.doesNotMatch(empty, /Limpiar búsqueda/);
  const searched = await render({ search: '<florero>' }); assert.match(searched, /No encontramos productos/); assert.match(searched, /data-product-action="clear-filters"/); assert.doesNotMatch(searched, /<florero>/);
  f.catalog.listProducts = async query => ({ items: [], page: Number(query.page), limit: 24, total: 25 });
  assert.match(await render({ page: '3' }), /No hay productos en esta página/);
  f.catalog.listProducts = async query => ({ items: [product], page: Number(query.page), limit: 24, total: 1 });
  assert.match(await render({}), /1<\/strong> producto en total/);
});

test('one editor takes a draft from name to photos, price and explicit publication', async () => {
  const f = fixture(), page = new AdminProductsPage(f.catalog);
  const engine = createViewEngine({ admin_product_images: '<div data-admin-media-root></div>' });
  const render = async (query: Record<string, string>) => {
    const { model, view } = await page.read(query);
    return new Promise<string>((resolve, reject) => engine.__express(join(__dirname, '../views', view + '.hbs'), model,
      (error, html) => error ? reject(error) : resolve(html!)));
  };
  const fresh = await render({ view: 'create' });
  assert.match(fresh, /<details open[^>]*><summary>Dirección del producto/);
  assert.match(fresh, /<details open[^>]*><summary>Medidas y embalaje/);
  assert.match(fresh, /name="initialPrice"/);
  assert.match(fresh, /name="initialSupplyMode"/);
  assert.match(fresh, /data-check-price/);
  assert.match(fresh, /data-preview-price/);
  assert.doesNotMatch(fresh, /Después de guardar podrá ingresar un precio/);
  assert.match(fresh, /<input[^>]*type="file"[^>]*multiple[^>]*data-new-photos-file/);
  assert.doesNotMatch(fresh, /Guarde el borrador con un nombre para subir fotos/);
  for (const marker of ['data-product-save', 'data-taxonomy-create="categories"', 'Fotos', 'Precio', 'data-product-preview']) assert.ok(fresh.includes(marker), marker);
  assert.doesNotMatch(fresh, /<select name="status"|data-product-publish/);
  f.catalog.getProduct = async id => ({ ...product, status: 'draft', id, variants: [], page: 1, limit: 24, total: 0 });
  const saved = await render({ view: 'detail', id: 'p1' });
  for (const marker of ['data-product-form', 'data-product-publish', 'data-pricing-save', 'data-product-media-slot', 'data-product-action="variant-create"']) assert.ok(saved.includes(marker), marker);
  for (const marker of ['data-pricing-cost', 'data-pricing-markup', 'data-pricing-sale', 'data-pricing-stock', 'data-pricing-unlimited']) assert.ok(fresh.includes(marker) && saved.includes(marker), marker);
  assert.doesNotMatch(saved, /unidades menores|todavía está en desarrollo/);
});
