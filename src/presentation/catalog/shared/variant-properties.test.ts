import assert from 'node:assert/strict';
import test from 'node:test';
import { groupProperties, matchProperty, selectionGroups } from './variant-properties';
import { parseVariant } from '../../shared/catalog/api-catalog';
import { publicVariantOptions } from '../../../modules/catalog/queries/public-variant-options';

const material = { id: 'pla', slug: 'pla', name: 'PLA' };
const variants = ['Navidad', 'Año Nuevo'].map((value, i) => ({ id: `v${i}`, name: `PLA / ${value}`, priceMinor: 100 + i, currency: 'ARS', material, options: [{ name: 'Diseño', value }] }));
test('one property groups different designs and case/spacing duplicates', () => {
  assert.deepEqual(groupProperties([{ name: ' Diseño ', value: 'Navidad' }, { name: 'DISEÑO', value: 'Año Nuevo' }, { name: 'diseño', value: 'NAVIDAD' }]), [{ name: 'Diseño', values: ['Navidad', 'Año Nuevo'] }]);
  assert.deepEqual(selectionGroups(variants), [{ name: 'Diseño', values: ['Navidad', 'Año Nuevo'] }]);
  assert.equal(matchProperty(variants, variants[0], 'Diseño', 'Año Nuevo')?.id, 'v1');
});
test('selection preserves the other property and never invents unavailable combinations', () => {
  const petg = { ...variants[0], id: 'petg-navidad', material: { ...material, id: 'petg', slug: 'petg', name: 'PETG' } };
  assert.equal(matchProperty([...variants, petg], variants[1], 'Material', 'PETG'), undefined);
  // Hidden differences must fall back to individual SKU controls, never collapse two purchasable variants.
  assert.deepEqual(selectionGroups([...variants, petg]), []);
  assert.equal(matchProperty([...variants, petg], petg, 'Diseño', 'Año Nuevo')?.id, 'v1');
  assert.equal(matchProperty(variants, variants[0], 'Diseño', 'Ausente'), undefined);
  assert.deepEqual(selectionGroups([variants[0], { ...variants[0], id: 'duplicate' }]), []);
});
test('public properties reach the parser without exposing private JSON keys', () => {
  const projected = publicVariantOptions(JSON.stringify([{ name: 'Diseño', value: 'Navidad', secret: 'private' }]));
  assert.deepEqual(projected, { options: [{ name: 'Diseño', value: 'Navidad' }] });
  const parsed = parseVariant({ ...variants[0], ...projected, supplyMode: 'stock', color: null });
  assert.equal(parsed.name, 'Navidad'); assert.equal(parsed.id, variants[0].id);
  assert.equal(variants[0].name, 'PLA / Navidad');
  assert.deepEqual(parsed.options, variants[0].options);
  assert.throws(() => parseVariant({ ...variants[0], options: [{}], supplyMode: 'stock', color: null }));
});
