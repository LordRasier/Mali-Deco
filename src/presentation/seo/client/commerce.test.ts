import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanCommerce } from './commerce-validation';
import { commerceData, type CommerceData, type CommerceEvent } from '../../shared/analytics/commerce';
import { parseCatalogQuery } from '../../catalog/shared/catalog-query';

test('commerce projects real prices and variants, rejects incomplete and mixed-currency carts', () => {
  const line = { product: { id: 'p', name: 'Florero', slug: 'florero', description: '', variants: [] }, variant: { id: 'gold', name: 'Dorado', priceMinor: 12345, currency: 'ARS' }, quantity: 3 };
  const data = commerceData([line])!; assert.equal(data.value, 370.35); assert.equal(data.items[0].price, 123.45); assert.equal(data.items[0].item_variant, 'gold');
  assert.equal(commerceData([{ ...line, variant: null }]), null);
  assert.equal(commerceData([line, { ...line, variant: { ...line.variant, currency: 'USD' } }]), null);
  const input = { ...data, email: 'private@example.com', items: [{ ...data.items[0], address: 'private' }] };
  assert.deepEqual(cleanCommerce('add_to_cart', input), data);
  assert.equal(cleanCommerce('purchase' as CommerceEvent, data), null); // Server is the only purchase sender.
  assert.equal(cleanCommerce('view_item', { items: [] }), null);
  assert.equal(cleanCommerce('add_to_cart', { ...data, currency: undefined } as CommerceData), null);
});
test('Tag Assistant query is tolerated without weakening catalog filters', () => {
  assert.equal(parseCatalogQuery(new URLSearchParams('gtm_debug=123456789&category=deco')).error, null);
  assert.notEqual(parseCatalogQuery(new URLSearchParams('gtm_debug=x&gtm_debug=y')).error, null);
  assert.notEqual(parseCatalogQuery(new URLSearchParams('unknown=abc')).error, null);
});
