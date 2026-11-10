import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CatalogPage } from './catalog-page';
import { defaultContentConfig } from '../../modules/settings/content-config';

const facets = { categories: [], materials: [], colors: [], currencies: ['USD', 'ARS'], priceRange: null, truncated: { categories: false, materials: false, colors: false } };
function fixture() {
  const calls: string[] = [];
  const catalog = {
    settings: async () => { calls.push('settings'); return { name: '<script>brand</script>' }; },
    list: async (query: Record<string, unknown>) => { calls.push('list'); return { items: [{ id: 'p1', slug: 'product', name: '<img onerror=bad>', description: '', bulkWarningThreshold: null, bulkWarningMessage: null, category: null, primaryImage: null, variantCount: 1, priceRange: null,
      matchedVariant: { id: 'v1', name: 'Zero', priceMinor: 0, currency: 'USD', supplyMode: 'stock' as const, stockQuantity: 10, material: null, color: null } }], page: Number(query.page), limit: 24, total: 1 }; },
  };
  return { calls, catalog, facets: { get: async () => { calls.push('facets'); return facets; } } };
}

test('invalid and duplicate URL parameters fail before any service reads', async () => {
  const f = fixture(), page = new CatalogPage(f.catalog, f.facets, 'api');
  for (const input of ['currency=USD&currency=ARS', 'category=a&category=b', 'layout=secret', 'page=0', 'category=']) {
    const result = await page.read(new URLSearchParams(input)); assert.equal(result.status, 400); assert.equal(result.redirect, undefined);
  }
  assert.deepEqual(f.calls, []);
});

test('listing drafts preview page size and labels while public reads use published settings', async () => {
  const f = fixture(), config = defaultContentConfig(), limits: string[] = [];
  f.catalog.list = async query => { limits.push(String(query.limit)); return { items: [], page: Number(query.page), limit: Number(query.limit), total: 30 }; };
  const page = new CatalogPage(f.catalog, f.facets, 'api', undefined, {}, { get: async () => ({ settings: config, revision: 1, available: true }) });
  const draft = { ...config.listing, pageSize: '12', itemPlural: 'productos', allCategoriesLabel: 'Ver todo' };
  const preview = await page.read(new URLSearchParams('page=2'), draft);
  assert.equal(preview.model.pages, 3); assert.equal(preview.model.resultLabel, '30 productos'); assert.equal(preview.model.categories[0].label, 'Ver todo');
  assert.match(preview.model.next, /page=3/);
  const live = await page.read(new URLSearchParams()); assert.equal(live.model.pages, 2); assert.equal(live.model.resultLabel, '30 objetos');
  assert.deepEqual(limits, ['12', '24']);
});
test('default currency prefers ARS from facets and keeps requested pagination without a redirect', async () => {
  const f = fixture(), page = new CatalogPage(f.catalog, f.facets, 'api');
  f.catalog.list = async (query) => { f.calls.push('list'); assert.equal(query.page, '3'); assert.equal(query.currency, 'ARS'); assert.equal(query.search, 'light'); return { items: [], page: 3, limit: 24, total: 50 }; };
  const result = await page.read(new URLSearchParams('search=light&category=deco&page=3'));
  assert.equal(result.status, 200); assert.equal(result.redirect, undefined);
  assert.equal(result.model.defaultCurrency, 'ARS'); assert.equal(f.calls.includes('list'), true);
});
test('projects matched variants explicitly, preserves zero prices and fixed local links', async () => {
  const f = fixture(), result = await new CatalogPage(f.catalog, f.facets, 'api').read(new URLSearchParams('currency=USD'));
  assert.equal(result.status, 200); assert.equal(result.model.brand, '<script>brand</script>');
  assert.equal(result.model.cards[0].name, '<img onerror=bad>');
  assert.match(result.model.cards[0].price, /0,00/); assert.equal(result.model.cards[0].href, '/productos/product?variant=v1');
});
test('requested unavailable currency is explicit and never silently replaced', async () => {
  const f = fixture(), result = await new CatalogPage(f.catalog, f.facets, 'api').read(new URLSearchParams('currency=EUR'));
  assert.equal(result.status, 200); assert.equal(result.redirect, undefined); assert.equal(result.model.currencyUnavailable, true);
  assert.equal(result.model.cards.length, 0); assert.equal(f.calls.includes('list'), false);
});
test('API failure renders an unavailable state, never demo or an empty successful catalog', async () => {
  const f = fixture(); f.catalog.list = async () => { throw Error('private database details'); };
  const result = await new CatalogPage(f.catalog, f.facets, 'api').read(new URLSearchParams('currency=USD'));
  assert.equal(result.status, 503); assert.equal(result.model.failed, true); assert.equal(result.model.demo, false);
  assert.doesNotMatch(JSON.stringify(result.model), /private database/); assert.deepEqual(result.model.cards, []);
});
test('demo is explicit and never touches API services', async () => {
  const f = fixture(), result = await new CatalogPage(f.catalog, f.facets, 'demo').read(new URLSearchParams('currency=ARS&search=Ondas'));
  assert.equal(result.status, 200); assert.equal(result.model.cards.length, 1); assert.equal(result.model.demo, true); assert.deepEqual(f.calls, []);
});

test('filter projection preserves checked choices and exact decimal price fields', async () => {
  const f = fixture(), result = await new CatalogPage(f.catalog, f.facets, 'demo').read(new URLSearchParams('currency=ARS&category=decoracion&minPriceMinor=0&maxPriceMinor=12345'));
  assert.equal(result.model.filters?.min, '0,00'); assert.equal(result.model.filters?.max, '123,45');
  assert.equal(result.model.filters?.groups[0].choices.find(item => item.value === 'decoracion')?.checked, true);
});

test('empty pages remain distinct from failures and retain bounded pagination links', async () => {
  const f = fixture(); f.catalog.list = async () => ({ items: [], page: 2, limit: 24, total: 25 });
  const result = await new CatalogPage(f.catalog, f.facets, 'api').read(new URLSearchParams('currency=USD&page=2'));
  assert.equal(result.status, 200); assert.equal(result.model.failed, false); assert.equal(result.model.empty, true);
  assert.equal(result.model.previous, '/catalogo?currency=USD'); assert.equal(result.model.next, '');
});

test('an empty currency selection cannot label the whole catalog unpublished', async () => {
  const f = fixture();
  f.catalog.list = async () => ({ items: [], page: 1, limit: 24, total: 0 });
  const { model } = await new CatalogPage(f.catalog, f.facets, 'api').read(new URLSearchParams('currency=USD'));
  assert.equal(model.empty, true);
  assert.equal(model.unpublished, false);
  assert.equal(model.showPagination, false);
});

test('top category navigation preserves search, other filters and sorting while resetting pagination', async () => {
  const f = fixture();
  const { model } = await new CatalogPage(f.catalog, { get: async () => ({ ...facets, categories: [{ id: 'c', slug: 'deco', name: 'Decoración', sortOrder: 0 }] }) }, 'api')
    .read(new URLSearchParams('currency=USD&search=florero&material=pla&sort=name_desc&page=2'));
  const params = new URL(model.categories[1].href, 'http://local').searchParams;
  assert.equal(params.get('category'), 'deco'); assert.equal(params.get('search'), 'florero');
  assert.equal(params.get('material'), 'pla'); assert.equal(params.get('sort'), 'name_desc'); assert.equal(params.has('page'), false);
});
