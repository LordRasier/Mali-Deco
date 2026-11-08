import assert from 'node:assert/strict';
import { dimensionFields, productInput, variantInput } from '../../src/presentation/admin/client/form-validation';
import { dimensionValue } from '../../src/presentation/admin/shared/product-dimensions';
const dimensions = Object.fromEntries(dimensionFields.map(([key]) => [key, ''])) as Record<(typeof dimensionFields)[number][0], string>;
const product = { name: 'Florero', slug: 'florero', description: '', status: 'draft' as const, ...dimensions };
assert.equal(productInput(product).productWidthMm, null);
assert.equal(productInput({ ...product, productWeightG: '123', packageWeightG: '456' }).packageWeightG, 456);
const metric = productInput({ ...product, productWidthMm: '12,5', productHeightMm: '20', productLengthMm: '0.1',
  packageWidthMm: '15.5', packageHeightMm: '25', packageLengthMm: '8,2' });
assert.deepEqual([metric.productWidthMm, metric.productHeightMm, metric.productLengthMm, metric.packageWidthMm, metric.packageHeightMm, metric.packageLengthMm], [125, 200, 1, 155, 250, 82]);
for (const millimetres of [1, 10, 101, 125, 4294967295]) {
  const value = dimensionValue('productWidthMm', millimetres);
  assert.equal(productInput({ ...product, productWidthMm: value }).productWidthMm, millimetres);
}
assert.equal(dimensionValue('packageWidthMm', null), '');
assert.equal(dimensionValue('productWeightG', 300), '300');
for (const invalid of ['0', '-1', '1,23', '1e2', 'NaN', '429496729,6']) assert.throws(() => productInput({ ...product, productWidthMm: invalid }));
for (const invalid of [{ ...product, slug: 'No Slug' }, { ...product, name: '  ' }, { ...product, productWeightG: '0' }, { ...product, packageWidthMm: '4294967296' }, { ...product, description: 'á'.repeat(32768) }]) assert.throws(() => productInput(invalid));
const variant = { sku: 'A-1', name: 'Rojo', price: '2.50', currency: 'ARS', supplyMode: 'stock' as const };
assert.equal(variantInput(variant).priceMinor, 250);
assert.throws(() => variantInput({ ...variant, sku: '' }));
assert.throws(() => variantInput({ ...variant, supplyMode: '' }));
assert.throws(() => variantInput({ ...variant, price: '2.501' }));
