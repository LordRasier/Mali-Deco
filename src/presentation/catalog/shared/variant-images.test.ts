import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogCards } from '../catalog-view';
import { parseCardData } from './card-data';
import { createCatalogCard } from '../client/state/catalog-card';
import { createProductStore } from '../../products/client/state/product-store';
import { ProductPage } from '../../products/product-page';
import { defaultVariant, variantImageId } from './variant-images';
import { parseVariant } from '../../shared/catalog/api-catalog';

const gold = 'a0000000-0000-4000-8000-000000000001', blue = 'a0000000-0000-4000-8000-000000000002';
const images = [gold, blue].map(id => ({ id, alt: '', width: 100, height: 100 }));
const variants = [{ id: 'blue', name: 'Azul', imageId: blue }, { id: 'gold', name: 'Dorado', imageId: gold }, { id: 'plain', name: 'Natural' }]
  .map((variant, i) => ({ ...variant, priceMinor: 100 + i, currency: 'ARS', supplyMode: 'stock' as const, stockQuantity: 5, material: null, color: null }));
const product = { id: 'p', slug: 'adorno', name: 'Adorno', description: '', variants: variants.map(v => ({ ...v, color: undefined })),
  images, primaryImage: images[0], variantCount: 3 };
const detail = { ...product, variants, category: null, bulkWarningThreshold: null, bulkWarningMessage: null,
  productWidthMm: null, productHeightMm: null, productLengthMm: null, page: 1, limit: 100, total: 3 };
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('cover selects the matching SKU in SSR and hydrated landing/catalog cards without reordering options', () => {
  const card = catalogCards([product], false)[0], hydrated = parseCardData(card.bootstrap);
  assert.equal(card.variant, 'Dorado'); assert.match(card.href, /variant=gold$/);
  assert.equal(card.gallery.find(image => image.first)?.id, gold); assert.match(card.zoomImage, new RegExp(gold));
  const state = createCatalogCard(hydrated, async (_product, id) => ({ variant: hydrated.variants.find(v => v.id === id)! }));
  assert.equal(state.snapshot().selected?.id, 'gold'); state.select('blue');
  assert.equal(variantImageId(state.snapshot().product, state.snapshot().selected), blue);
  state.select('plain'); assert.equal(variantImageId(hydrated, state.snapshot().selected), gold);
  assert.deepEqual(hydrated.variants.map(v => v.id), ['blue', 'gold', 'plain']); state.dispose();
});

test('product defaults and explicit variant links agree between SSR and the browser, including missing photos', async () => {
  const catalog = { settings: async () => ({ name: 'Tienda' }), detail: async () => detail };
  for (const [search, selected, image] of [['', 'gold', gold], ['variant=blue', 'blue', blue], ['variant=plain', 'plain', gold]]) {
    const page = await new ProductPage(catalog, 'api').read(product.slug, new URLSearchParams(search));
    assert.equal(page.model.selectedVariantId, selected); assert.equal(page.model.images.find(image => image.first)?.id, image);
    let current = search;
    const state = createProductStore(product, 3, 'api', { runtime: { search: () => current, choose: id => { current = `variant=${id}`; }, listen: () => () => {} } });
    const stop = state.start(); await settle(); assert.equal(state.getSnapshot().selected?.id, selected);
    state.choose('blue'); await settle(); assert.equal(variantImageId(product, state.getSnapshot().selected), blue); stop();
  }
});

test('missing assignments fall back safely and image identifiers cannot become arbitrary image URLs', () => {
  assert.equal(defaultVariant(variants, 'unassigned')?.id, 'blue');
  assert.equal(variantImageId(product, { imageId: 'not-public' }), gold);
  assert.equal(variantImageId({ images: [] }, variants[0]), undefined);
  assert.equal(parseVariant(variants[1]).imageId, gold);
  assert.throws(() => parseVariant({ ...variants[1], imageId: 'https://external.example/photo' }));
  assert.throws(() => parseCardData(JSON.stringify({ ...product, images: Array(11).fill(images[0]) })));
});
