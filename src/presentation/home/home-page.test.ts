import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HomePage } from './home-page';

function fixture() {
  const calls: unknown[] = [];
  const catalog = {
    settings: async () => { calls.push('settings'); return { name: 'Synthetic brand' }; },
    list: async (query: unknown) => { calls.push(query); return { items: ['a', 'b', 'c', 'd'].map(id => ({ id, slug: id, name: id, description: '', bulkWarningThreshold: null, bulkWarningMessage: null, category: null, primaryImage: null, priceRange: null, matchedVariant: null })), page: 1, limit: 24, total: 4 }; },
  };
  return { catalog, calls };
}
test('home requests featured priority with a bounded listing and keeps three products', async () => {
  const { catalog, calls } = fixture(); const result = await new HomePage(catalog, 'api').read();
  assert.equal(result.status, 200); assert.equal(result.model.brand, 'Synthetic brand');
  assert.deepEqual(result.model.cards.map(card => card.name), ['a', 'b', 'c']);
  assert.deepEqual(calls, ['settings', { sort: 'featured_first', page: '1', limit: '24' }]);
});

test('home without saved layout leads with a highlighted product and fills the other slots', async () => {
  const { catalog } = fixture(), list = catalog.list;
  catalog.list = async query => {
    const page = await list(query), featured = { ...page.items[0], id: 'z', slug: 'z', name: 'z' };
    return { ...page, items: (query as { sort: string }).sort === 'featured_first' ? [featured, ...page.items] : [...page.items, featured] };
  };
  const result = await new HomePage(catalog, 'api').read();
  assert.equal(result.status, 200); assert.deepEqual(result.model.cards.map(card => card.productId), ['z', 'a', 'b']);
});
test('home demo preserves editorial ordering without any API calls', async () => {
  const { catalog, calls } = fixture(); const result = await new HomePage(catalog, 'demo').read();
  assert.equal(result.model.demo, true); assert.deepEqual(calls, []);
  assert.equal(result.model.cards[0].name, 'Florero Ondas');
});
test('home keeps unavailable distinct from an empty successful catalog', async () => {
  const { catalog } = fixture(); catalog.list = async () => ({ items: [], page: 1, limit: 24, total: 0 });
  const empty = await new HomePage(catalog, 'api').read(); assert.equal(empty.status, 200); assert.equal(empty.model.failed, false);
  catalog.list = async () => { throw Error('Private database failure'); };
  const failed = await new HomePage(catalog, 'api').read(); assert.equal(failed.status, 503); assert.equal(failed.model.failed, true);
  assert.deepEqual(failed.model.cards, []); assert.doesNotMatch(JSON.stringify(failed), /Private database/);
});
