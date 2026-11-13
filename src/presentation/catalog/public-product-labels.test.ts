import assert from 'node:assert/strict';
import test from 'node:test';
import { publicVariantName } from '../../shared/public-variant-name';
import { catalogCards } from './catalog-view';
import { ProductPage } from '../products/product-page';
import { productSchema } from '../seo/product-schema';
import { publicOrderLines } from '../../modules/catalog/queries/public-material-labels';

const material = { id: 'pla', slug: 'pla', name: 'PLA' };
const variant = { id: 'v1', name: 'PLA / Navidad', priceMinor: 100, currency: 'ARS', material, color: null,
  supplyMode: 'made_to_order' as const, stockQuantity: 0, options: [{ name: 'Diseño', value: 'Navidad' }] };
const detail = { id: 'p1', slug: 'adorno', name: 'Adorno', description: 'Decoración', category: null, images: [],
  bulkWarningThreshold: null, bulkWarningMessage: null, productWidthMm: null, productHeightMm: null, productLengthMm: null,
  variants: [variant], page: 1, limit: 100, total: 1 };

test('public labels remove complete material components without corrupting custom names', () => {
  for (const name of ['PLA / Navidad', 'PLA · Navidad', 'Material: pla / Navidad']) assert.equal(publicVariantName(name, ['PLA']), 'Navidad');
  assert.equal(publicVariantName('PLA', ['PLA']), 'Estándar');
  assert.equal(publicVariantName('Plato / Plantas', ['PLA']), 'Plato / Plantas');
  assert.equal(publicVariantName('Navidad', ['PLA']), 'Navidad');
});

test('landing and catalog cards, product SSR and structured data hide material while keeping SKU and prices', async () => {
  const product = { ...detail, variants: [{ ...variant, color: undefined }] };
  const card = catalogCards([product], false)[0];
  assert.equal(card.variant, 'Navidad'); assert.equal(JSON.parse(card.bootstrap).variants[0].name, 'Navidad');
  assert.match(card.href, /variant=v1/);
  const page = new ProductPage({ settings: async () => ({ name: 'Tienda' }), detail: async () => detail }, 'api');
  const { model, status } = await page.read('adorno');
  assert.equal(status, 200); assert.equal(model.selectedName, 'Navidad');
  assert.equal(model.variantSummary[0].name, 'Navidad'); assert.equal(model.variants[0].id, 'v1');
  assert.doesNotMatch(JSON.stringify(productSchema(detail, 'https://store.example', 'Tienda')), /PLA|material/);
  assert.equal(variant.name, 'PLA / Navidad'); assert.equal(variant.priceMinor, 100);
});

test('customer order labels use purchased variant materials and preserve the stored snapshot and unrelated names', async () => {
  const saved = [{ variantName: 'PLA / Navidad', quantity: 2 }, { variantName: 'Natural', quantity: 1 }];
  const variants = [{ variantId: 'v1', variantName: saved[0].variantName }, { variantId: 'v2', variantName: saved[1].variantName }];
  const db = { query: async (_sql: string, ids?: unknown[]) => {
    assert.deepEqual(ids, ['v1', 'v2']);
    return [{ variantId: 'v1', name: 'PLA' }, { variantId: 'v2', name: 'PETG' }];
  } };
  assert.deepEqual(await publicOrderLines(db, saved, variants), [{ variantName: 'Navidad', quantity: 2 }, { variantName: 'Natural', quantity: 1 }]);
  assert.equal(saved[0].variantName, 'PLA / Navidad');
});
