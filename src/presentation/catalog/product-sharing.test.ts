import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CatalogPage } from './catalog-page';
import { catalogCards } from './catalog-view';
import { pageMetadata } from '../seo/metadata';
import { defaultSiteConfig } from '../../modules/settings/site-config';

const image = { id: 'cover', alt: 'Florero azul', width: 800, height: 800 };
const product = { id: 'stable-id', slug: 'new-name', name: 'Florero azul', description: 'Una pieza para tu casa.',
  bulkWarningThreshold: null, bulkWarningMessage: null,
  category: null, primaryImage: image, images: [image], variantCount: 1, priceRange: null,
  matchedVariant: { id: 'variant', name: 'Standard', priceMinor: 1000, currency: 'ARS', color: null, material: null, supplyMode: null, stockQuantity: 0 } };
const result = (items = [product]) => ({ items, page: 1, limit: 24, total: items.length });
const facets = { get: async () => ({ categories: [], materials: [], colors: [], currencies: ['ARS'], priceRange: null, truncated: { categories: false, materials: false, colors: false } }) };

test('share links use stable product IDs rather than mutable names, variants or current filters', () => {
  const card = catalogCards([{ id: product.id, slug: product.slug, name: product.name, description: '', variants: [] }], false)[0];
  assert.equal(card.sharePath, '/catalogo?articulo=stable-id#producto-stable-id');
  assert.equal(card.productId, product.id);
});

test('demonstration products never expose links that impersonate published articles', () => {
  const card = catalogCards([{ id: product.id, slug: product.slug, name: product.name, description: '', variants: [] }], true)[0];
  assert.equal(card.sharePath, '');
});

test('a shared product outside the current catalog page is rendered with its own focus anchor', async () => {
  const requested: string[][] = [];
  const other = { ...product, id: 'other', slug: 'other' };
  const page = new CatalogPage({ settings: async () => ({ name: 'Mali' }), list: async () => result([other]),
    selected: async (ids: string[]) => { requested.push(ids); return result(); } }, facets, 'api');
  const shared = await page.read(new URLSearchParams('articulo=stable-id&utm_source=instagram'));
  assert.equal(shared.status, 200); assert.deepEqual(requested, [['stable-id']]);
  assert.equal(shared.model.sharedCard?.anchorId, 'producto-stable-id');
  assert.equal(shared.model.sharedCard?.name, product.name);
  assert.equal(shared.model.sharedProduct?.images?.[0].id, image.id);
  assert.equal(shared.model.cards[0].productId, 'other');
  assert.equal((await page.read(new URLSearchParams())).model.sharedCard, undefined);
});

test('sharing deduplicates a visible card and rejects private, missing and invalid products', async () => {
  let calls = 0;
  const page = new CatalogPage({ settings: async () => ({ name: 'Mali' }), list: async () => result(),
    selected: async (ids: string[]) => { calls++; return result(ids[0] === product.id ? [product] : []); } }, facets, 'api');
  const shared = await page.read(new URLSearchParams('articulo=stable-id'));
  assert.equal(shared.status, 200); assert.equal(shared.model.cards.length, 0);
  const missing = await page.read(new URLSearchParams('articulo=private'));
  assert.equal(missing.status, 404); assert.equal(missing.model.sharedProduct, undefined);
  for (const query of ['articulo=', 'articulo=one&articulo=two', 'articulo=../private', 'articulo=' + 'x'.repeat(81)]) {
    assert.equal((await page.read(new URLSearchParams(query))).status, 400);
  }
  assert.equal(calls, 2, 'Invalid identifiers never reach the product service');
});

test('shared product failures are unavailable, not a fabricated missing product or generic successful preview', async () => {
  const page = new CatalogPage({ settings: async () => ({ name: 'Mali' }), list: async () => result(),
    selected: async () => { throw Error('database offline'); } }, facets, 'api');
  const failed = await page.read(new URLSearchParams('articulo=stable-id'));
  assert.equal(failed.status, 503); assert.equal(failed.model.sharedProduct, undefined);
  assert.equal(failed.model.retry, '/catalogo?articulo=stable-id#producto-stable-id');
});

test('social crawlers receive the shared product cover and stable URL without running JavaScript', () => {
  const config = { ...defaultSiteConfig(), publicSiteUrl: 'https://shop.example' };
  const seo = pageMetadata('catalog', { brand: 'Mali', sharedProduct: product }, '/catalogo', new URLSearchParams('articulo=stable-id&utm_source=instagram'), 200, config, { NODE_ENV: 'production' });
  assert.equal(seo.title, 'Florero azul | Mali'); assert.equal(seo.description, product.description);
  assert.equal(seo.image, 'https://shop.example/api/v1/catalog/images/cover?w=1600');
  assert.equal(seo.socialUrl, 'https://shop.example/catalogo?articulo=stable-id');
  assert.equal(seo.socialType, 'product'); assert.equal(seo.noindex, true);
  assert.equal(seo.canonical, '', 'Sharing does not add duplicate indexable product pages');
});
