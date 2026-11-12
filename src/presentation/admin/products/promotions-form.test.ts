import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { productFormInput } from '../client/browser/products/product-form';
import { variantFormInput } from '../client/browser/products/variant-form';
import { variantFormModel } from './admin-variants-model';
import type { VariantRow } from '../../../modules/catalog/models/catalog.entities';

test('admin forms include feature and discount controls and parse exact nullable money', () => {
  const product = { name: 'Vase', slug: 'vase', status: 'draft', description: '', featured: 'true' };
  const read = (name: string) => product[name as keyof typeof product] ?? '';
  assert.equal(productFormInput(read, false).featured, true);
  assert.equal(productFormInput(name => name === 'featured' ? 'false' : read(name), false).featured, false);
  const variant = { sku: 'v', name: 'Small', price: '100,00', salePrice: '75,50', currency: 'ARS', supplyMode: 'stock' };
  const readVariant = (name: string) => variant[name as keyof typeof variant] ?? '';
  assert.equal(variantFormInput(readVariant, { material: false, color: false }).salePriceMinor, 7550);
  assert.equal(variantFormInput(name => name === 'salePrice' ? '' : readVariant(name), { material: false, color: false }).salePriceMinor, null);
  assert.equal(variantFormModel({ ...variant, priceMinor: '10000', salePriceMinor: '7550' } as unknown as VariantRow).variant.salePrice, '75.50');
  const html = readFileSync(join(__dirname, '../views/admin-product-form.hbs'), 'utf8');
  assert.match(html, /name="featured"/);
  assert.equal((html.match(/data-pricing-discount/g) ?? []).length, 3);
});
