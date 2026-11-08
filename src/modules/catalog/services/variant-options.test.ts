import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { saveVariantImage, validateVariantOptions } from './variant-options';
import { CatalogAdmin } from './catalog-admin';

const image = '11111111-1111-4111-8111-111111111111';
test('custom properties normalize values, preserve omission and reject duplicates or incomplete pairs', () => {
  assert.equal(validateVariantOptions(undefined), undefined);
  assert.deepEqual(validateVariantOptions([]), []);
  assert.deepEqual(validateVariantOptions([{ name: ' Tamaño ', value: ' Grande ' }]), [{ name: 'Tamaño', value: 'Grande' }]);
  for (const invalid of [null, {}, [{ name: 'Tamaño', value: '' }], [{ name: 'Color', value: 'Rojo' }], [{ name: 'tamaño', value: 'A' }, { name: 'TAMAÑO', value: 'B' }],
    [{ name: 'Talla', value: 'A', extra: true }], [{ name: 'X'.repeat(61), value: 'Y' }], [{ name: 'Talla', value: 'A\nB' }],
    Array.from({ length: 9 }, (_, i) => ({ name: String(i), value: 'A' }))]) assert.throws(() => validateVariantOptions(invalid), { status: 400 });
});

function fixture({ current = null as string | null, imageExists = true, parent = true, variant = true } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = { query: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT id FROM products')) return parent ? [{ id: 'p' }] : [];
    if (sql.startsWith('SELECT image_id')) return variant ? [{ imageId: current }] : [];
    if (sql.startsWith('SELECT id FROM product_images')) return imageExists ? [{ id: image }] : [];
    return { affectedRows: 1 };
  } };
  return { calls, db: { transaction: (work: (t: typeof tx) => unknown) => work(tx) } as unknown as DataSource };
}
test('variant photo assignment requires an active image of the same product and changes only image_id', async () => {
  const f = fixture();
  assert.deepEqual(await saveVariantImage(f.db, 'p', 'v', { imageId: image, expectedImageId: null }), { id: 'v', productId: 'p', imageId: image });
  assert.match(f.calls[0].sql, /FOR UPDATE/);
  assert.match(f.calls[2].sql, /product_id = \? AND retired_at IS NULL/);
  assert.deepEqual(f.calls[2].values, [image, 'p']);
  assert.equal(f.calls[3].sql, 'UPDATE product_variants SET image_id = ? WHERE id = ? AND product_id = ?');
  const otherProduct = fixture({ imageExists: false });
  await assert.rejects(saveVariantImage(otherProduct.db, 'p', 'v', { imageId: image, expectedImageId: null }), { status: 400 });
  assert.ok(otherProduct.calls.every(c => !c.sql.startsWith('UPDATE')));
});
test('photo assignment protects concurrent changes, archived parents and malformed bodies', async () => {
  await assert.rejects(saveVariantImage(fixture({ current: image }).db, 'p', 'v', { imageId: null, expectedImageId: null }), { status: 409 });
  for (const setting of [{ parent: false }, { variant: false }]) await assert.rejects(saveVariantImage(fixture(setting).db, 'p', 'v', { imageId: image, expectedImageId: null }), { status: 404 });
  for (const value of [{ imageId: image }, { imageId: 'https://external/image', expectedImageId: null }, { imageId: null, expectedImageId: null, stockQuantity: 10 }]) {
    await assert.rejects(saveVariantImage(fixture().db, 'p', 'v', value), { status: 400 });
  }
  assert.equal((await saveVariantImage(fixture({ current: image }).db, 'p', 'v', { imageId: null, expectedImageId: image })).imageId, null);
});
test('variant create/update validate options before persistence', async () => {
  const input = { sku: 'S', name: 'Grande', priceMinor: 1200, currency: 'ARS', supplyMode: 'stock' as const, options: [{ name: 'Tamaño', value: '' }] };
  const admin = new CatalogAdmin();
  await assert.rejects(admin.createVariant('p', input), { status: 400 });
  await assert.rejects(admin.updateVariant('p', 'v', input), { status: 400 });
});
