import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContentConfig } from '../../modules/settings/content-config';
import { newBlock } from '../../shared/landing-layout';
import { landingView } from './landing-view';
import { publicCatalogFixture, publicFacetsFixture } from '../../../tests/support/public-storefront';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
test('real catalog selection is ordered, cached and isolated between published and draft layouts', async () => {
  const config = defaultContentConfig(); const products = config.landing.blocks[1];
  products.props.mode = 'manual'; products.props.productIds = ['b', 'a']; let reads = 0;
  const catalog = { ...publicCatalogFixture, selected: async (ids: string[]) => { reads++; const page = await publicCatalogFixture.list(); return { ...page, items: ids.map(id => ({ ...page.items[0], id, slug: id, name: id })) }; } } as unknown as Pick<PublicCatalog, 'list' | 'selected'>;
  const copy = structuredClone(products); copy.id = 'another-products'; copy.enabled = false; config.landing.blocks.push(copy);
  const live = await landingView(config, catalog, publicFacetsFixture, '/productos/', false);
  assert.equal(live.landingBlocks.length, 3); assert.equal(reads, 1);
  const cards = live.landingBlocks[1].cards as { name: string }[]; assert.deepEqual(cards.map(c => c.name), ['b', 'a']);
  reads = 0; const draft = await landingView(config, catalog, publicFacetsFixture, '/productos/', true); assert.equal(draft.landingBlocks.length, 4); assert.equal(reads, 1);
  config.features.catalog = false; reads = 0; const disabled = await landingView(config, catalog, publicFacetsFixture, '/productos/', false); assert.equal(disabled.landingBlocks.length, 2); assert.equal(reads, 0);
});
test('nested categories retain selected order, media uses authenticated draft paths, and headings are unique', async () => {
  const config = defaultContentConfig(), categories = newBlock('categories', 'categories'), box = newBlock('container', 'box');
  categories.props.categoryIds = ['two', 'one']; box.columns[0].blocks.push(categories);
  config.landing.blocks.push(box, newBlock('hero', 'second-hero'));
  config.landing.blocks[0].props.image = '/api/v1/catalog/content-media/12345678-1234-1234-1234-123456789012';
  const facets = { get: async () => ({ ...await publicFacetsFixture.get(), categories: ['one', 'two'].map(id => ({ id, slug: id, name: id, sortOrder: 1 })) }) };
  const catalog = { ...publicCatalogFixture, selected: publicCatalogFixture.list } as unknown as Pick<PublicCatalog, 'list' | 'selected'>;
  const result = await landingView(config, catalog, facets, '/productos/', true);
  assert.equal(result.landingBlocks.filter(b => b.primaryHeading).length, 1);
  assert.match(String(result.landingBlocks[0].image), /\/admin\/settings\/content\/media\//);
  assert.deepEqual((result.landingBlocks[3].columns[0].blocks[0].items as { name: string; href: string }[]).map(({ name, href }) => ({ name, href })), [{ name: 'two', href: '/categorias/two' }, { name: 'one', href: '/categorias/one' }]);
});

test('category styles use shared category images and captions, with icon fallbacks', async () => {
  const config = defaultContentConfig(), categories = newBlock('categories', 'categories'); config.landing.blocks = [categories];
  const facets = { get: async () => ({ ...await publicFacetsFixture.get(), categories: [{ id: 'one', slug: 'dados', name: 'Dados', sortOrder: 0,
    presentation: { image: '/api/v1/catalog/category-images/one/version', description: 'Para la próxima aventura', imageAlt: 'Dados azules', icon: 'dice' as const } }] }) };
  const catalog = { ...publicCatalogFixture, selected: publicCatalogFixture.list } as unknown as Pick<PublicCatalog, 'list' | 'selected'>;
  for (const style of ['icons', 'photo', 'circles']) {
    categories.props.cardStyle = style;
    const result = await landingView(config, catalog, facets, '/productos/', false);
    const [item] = result.landingBlocks[0].items as { image: string; description: string; iconPath: string }[];
    assert.equal(!!item.image, style !== 'icons'); assert.equal(item.description, 'Para la próxima aventura'); assert.ok(item.iconPath);
  }
});
