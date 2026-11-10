import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyCatalogQuery } from './catalog-query';
import { toggleCatalogFilter, changeCatalogCurrency, applyCatalogPrices, clearCatalogFilters } from './catalog-filters';

test('toggling one choice preserves unknown selections and does not mutate the applied query', () => {
  const original = { ...emptyCatalogQuery(), category: ['not-in-metadata'], color: ['blue'], page: 4 };
  const draft = toggleCatalogFilter(original, 'category', 'deco');
  assert.deepEqual(draft.category, ['not-in-metadata', 'deco']); assert.deepEqual(original.category, ['not-in-metadata']);
  assert.deepEqual(toggleCatalogFilter(draft, 'category', 'deco'), original);
});
test('selection limits do not silently drop existing filters', () => {
  const query = { ...emptyCatalogQuery(), material: Array.from({ length: 20 }, (_, i) => `material-${i}`) };
  assert.equal(toggleCatalogFilter(query, 'material', 'extra'), query);
  assert.equal(toggleCatalogFilter(query, 'material', 'material-0').material.length, 19);
});
test('currency changes clear prices and disallow price sorting without a currency', () => {
  const query = { ...emptyCatalogQuery(), currency: 'ARS', minPriceMinor: '0', maxPriceMinor: '100', sort: 'price_desc' as const };
  const changed = changeCatalogCurrency(query, 'USD'); assert.equal(changed.minPriceMinor, ''); assert.equal(changed.maxPriceMinor, '');
  assert.equal(changed.sort, 'price_desc'); assert.equal(changeCatalogCurrency(query, '').sort, 'name_asc');
});
test('applying prices uses exact minor units, preserves filters and resets pagination', () => {
  const query = { ...emptyCatalogQuery(), currency: 'ARS', category: ['deco'], page: 3 };
  const result = applyCatalogPrices(query, '0', '123,45');
  assert.equal(result.minPriceMinor, '0'); assert.equal(result.maxPriceMinor, '12345'); assert.equal(result.page, 1);
  assert.deepEqual(result.category, ['deco']); assert.equal(query.page, 3);
});
test('invalid prices never return a broader successful query', () => {
  const query = { ...emptyCatalogQuery(), currency: 'ARS' };
  for (const [min, max] of [['1,234', ''], ['-1', ''], ['3', '2'], ['1.000,00', '']]) assert.throws(() => applyCatalogPrices(query, min, max));
  assert.throws(() => applyCatalogPrices(emptyCatalogQuery(), '1', ''));
});
test('clear is a new draft retaining currency, not a mutation of applied state', () => {
  const applied = { ...emptyCatalogQuery(), search: 'vase', currency: 'ARS', color: ['blue'] };
  assert.deepEqual(clearCatalogFilters(applied), { ...emptyCatalogQuery(), currency: 'ARS' });
  assert.equal(applied.search, 'vase'); assert.deepEqual(applied.color, ['blue']);
});
