import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContentConfig } from '../../modules/settings/content-config';
import { newBlock } from '../../shared/landing-layout';
import { landingView } from './landing-view';
import { publicCatalogFixture, publicFacetsFixture } from '../../../tests/support/public-storefront';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';

test('featured landing blocks prioritize products without rewriting published selections', async () => {
  const config = defaultContentConfig(), calls: Record<string, unknown>[] = [];
  const catalog = { ...publicCatalogFixture, list: async (query: Record<string, unknown>) => { calls.push(query); return publicCatalogFixture.list(); } } as unknown as Pick<PublicCatalog, 'list' | 'selected'>;
  const draft = structuredClone(config); draft.landing.blocks[1].props.mode = 'featured';
  await landingView(draft, catalog, publicFacetsFixture, '/productos', true);
  assert.deepEqual(calls, [{ limit: '24', sort: 'featured_first' }]);
  assert.equal(config.landing.blocks[1].props.mode, 'category');
});

async function priorityFixture(featuredCount: number, outsideCategory = false) {
  const page = await publicCatalogFixture.list(), calls: Record<string, unknown>[] = [];
  const item = (id: string, featured: boolean, category = 'vases') => ({ ...page.items[0], id, slug: id, name: id, featured,
    category: { id: category, slug: category, name: category } });
  const entries = [...Array.from({ length: 30 }, (_, i) => item(`ordinary-${String(i).padStart(2, '0')}`, false)),
    ...Array.from({ length: featuredCount }, (_, i) => item(`z-featured-${i}`, true)),
    ...(outsideCategory ? [item('a-outside-featured', true, 'other')] : [])];
  const catalog = { ...publicCatalogFixture, list: async (query: Record<string, unknown>) => {
    calls.push(query);
    const eligible = entries.filter(p => (!query.category || p.category.slug === query.category) && (!query.featured || p.featured));
    eligible.sort((a, b) => (query.sort === 'featured_first' ? Number(b.featured) - Number(a.featured) : 0) || a.name.localeCompare(b.name));
    return { ...page, total: eligible.length, items: eligible.slice(0, Number(query.limit)) };
  } } as unknown as Pick<PublicCatalog, 'list' | 'selected'>;
  return { catalog, calls };
}

test('automatic landing fills three slots with featured first, including highlights beyond the old first page', async () => {
  for (const mode of ['category', 'featured']) for (const count of [0, 1, 2, 4]) {
    const config = defaultContentConfig(); config.landing.blocks[1].props.mode = mode;
    const original = structuredClone(config), { catalog } = await priorityFixture(count);
    const expected = [...Array.from({ length: count }, (_, i) => `z-featured-${i}`), 'ordinary-00', 'ordinary-01', 'ordinary-02'].slice(0, 3);
    for (const preview of [false, true]) {
      const result = await landingView(config, catalog, publicFacetsFixture, '/productos', preview);
      const cards = result.landingBlocks[1].cards as { productId: string }[];
      assert.deepEqual(cards.map(card => card.productId), expected, `${mode}/${count}/${preview}`);
      assert.equal(new Set(cards.map(card => card.productId)).size, 3);
    }
    assert.deepEqual(config, original);
  }
});

test('category priority stays scoped, shared reads stay cached, and global priority ignores a stale category', async () => {
  const config = defaultContentConfig(), block = config.landing.blocks[1]; block.props.category = 'vases';
  const copy = structuredClone(block); copy.id = 'another-products'; copy.props.limit = 1; config.landing.blocks.push(copy);
  const { catalog, calls } = await priorityFixture(1, true);
  const result = await landingView(config, catalog, publicFacetsFixture, '/productos', false);
  const ids = (index: number) => (result.landingBlocks[index].cards as { productId: string }[]).map(c => c.productId);
  assert.deepEqual(ids(1), ['z-featured-0', 'ordinary-00', 'ordinary-01']); assert.deepEqual(ids(3), ['z-featured-0']);
  assert.deepEqual(calls, [{ limit: '24', sort: 'featured_first', category: 'vases' }]);
  block.props.mode = 'featured'; calls.length = 0;
  const global = await landingView(config, catalog, publicFacetsFixture, '/productos', false);
  assert.equal((global.landingBlocks[1].cards as { productId: string }[])[0].productId, 'a-outside-featured');
  assert.deepEqual(calls[0], { limit: '24', sort: 'featured_first' });
});
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
