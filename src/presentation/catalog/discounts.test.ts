import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogCards, publicProducts } from './catalog-view';
import { parseCardData } from './shared/card-data';
import { parseVariant } from '../shared/catalog/api-catalog';
import type { Product } from './shared/storefront-types';
import { publicCatalogFixture } from '../../../tests/support/public-storefront';

const variant = { id: 'v', name: 'Small', currency: 'ARS', priceMinor: 7500, regularPriceMinor: 10000, discountPercent: '25' };
const product: Product = { id: 'p', slug: 'vase', name: 'Vase', description: '', variants: [variant], variantCount: 1 };

test('SSR and hydration preserve the selected variant discount, including zero payable prices', async () => {
  const page = await publicCatalogFixture.list();
  const item = { ...page.items[0], bulkWarningThreshold: null, bulkWarningMessage: null,
    matchedVariant: { ...page.items[0].matchedVariant, ...variant, supplyMode: 'made_to_order' as const, stockQuantity: 0 } };
  const mapped = publicProducts({ ...page, items: [item] })[0]; assert.equal(mapped.variants[0].regularPriceMinor, 10000);
  const card = catalogCards([product], false)[0];
  assert.equal(card.discountPercent, '25'); assert.match(card.regularPrice, /100/);
  assert.equal(parseCardData(card.bootstrap).variants[0].discountPercent, '25');
  const free = catalogCards([{ ...product, variants: [{ ...variant, priceMinor: 0, discountPercent: '100' }] }], false)[0];
  assert.equal(free.discountPercent, '100'); assert.match(free.price, /0/);
});

test('sampled cards never claim a product-wide saving and variant changes can remove discounts', () => {
  const partial = catalogCards([{ ...product, variantCount: 20 }], false)[0];
  assert.equal(partial.discountPercent, ''); assert.equal(partial.regularPrice, '');
  const normal = catalogCards([{ ...product, variants: [{ id: 'v2', name: 'Large', priceMinor: 20000, currency: 'ARS' }] }], false)[0];
  assert.equal(normal.discountPercent, ''); assert.equal(normal.regularPrice, '');
});

test('untrusted discount metadata must agree with validated regular and payable amounts', () => {
  const raw = { ...variant, material: null, color: null, supplyMode: null };
  assert.equal(parseVariant(raw).regularPriceMinor, 10000);
  for (const changed of [{ regularPriceMinor: 7000 }, { regularPriceMinor: -1 }, { regularPriceMinor: '10000' }, { discountPercent: '50' }]) {
    assert.throws(() => parseVariant({ ...raw, ...changed }));
  }
});
