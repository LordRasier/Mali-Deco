import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { createViewEngine } from '../view-engine';
import { catalogFilters } from './catalog-filters-view';
import { emptyCatalogQuery } from './shared/catalog-query';
import type { Facets } from './shared/storefront-types';
import { catalogColor } from './catalog-color';

const facets: Facets = { currencies: ['ARS'], categories: [], materials: [], priceRange: null,
  colors: [{ id: 'sand', slug: 'arena', name: 'Arena', hex: '#d9cbbc' },
    { id: 'bad', slug: 'bad', name: '<script>Bad</script>', hex: 'url(https://untrusted.invalid)' }],
  truncated: { categories: false, colors: false, materials: false } };

test('color attributes accept only complete hex literals, never whitespace or executable values', () => {
  for (const color of ['#000000', '#ffffff', '#AAbbCC']) assert.equal(catalogColor(color), color);
  for (const color of [null, undefined, 42, {}, '#abc', '#abcdef\n', '#abcdef ', 'url(https://untrusted.invalid)', '#ffffff" onload="bad']) {
    assert.equal(catalogColor(color), '');
  }
});

test('filter groups remain compact without hiding an applied selection and colors are validated', () => {
  const initial = catalogFilters(emptyCatalogQuery(), facets);
  assert.deepEqual(initial.groups.map(group => group.key), ['category', 'color']);
  assert.deepEqual(initial.groups.map(group => group.expanded), [true, true]);
  const filtered = catalogFilters({ ...emptyCatalogQuery(), material: ['unknown'], color: ['arena'] }, facets);
  assert.equal(filtered.groups[1].expanded, true);
  assert.equal(filtered.groups[1].choices[0].checked, true);
  assert.equal(filtered.groups[1].choices[0].colorHex, '#d9cbbc');
  assert.equal(filtered.groups[1].choices[1].colorHex, '');
});

test('filter form preserves native labels, controls and cancel semantics without inline CSS', async () => {
  const engine = createViewEngine({});
  for (const mobile of [false, true]) {
    const prefix = mobile ? 'mobile' : 'desktop';
    const html = await new Promise<string>((accept, reject) => engine.__express(join(__dirname, 'views/partials/filters.hbs'), {
      ...catalogFilters({ ...emptyCatalogQuery(), currency: 'ARS', color: ['arena'] }, facets), layout: false, mobile, prefix,
    }, (error, result) => error ? reject(error) : accept(result!)));
    assert.match(html, /<details class="filter-section" open/);
    assert.match(html, /type="checkbox" data-filter-group="color" value="arena" checked/);
    assert.match(html, /fill="#d9cbbc"/); assert.match(html, /&lt;script&gt;Bad&lt;\/script&gt;/);
    assert.doesNotMatch(html, /untrusted.invalid|style=|Material|data-filter-group="material"/);
    assert.match(html, new RegExp(`for="${prefix}-min"`)); assert.match(html, /data-filter-min/);
    assert.match(html, /data-filter-fields disabled/);
    assert.equal(html.includes('data-filter-cancel'), mobile);
  }
});
