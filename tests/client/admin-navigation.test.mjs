import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSections, resolveAdminSection } from '../../src/presentation/admin/shared/navigation.ts';

test('owner can navigate all existing administrative capabilities', () => {
  assert.deepEqual(adminSections('owner').map(item => item.id), ['products', 'classifications', 'orders', 'editor', 'settings']);
  for (const item of adminSections('owner')) {
    assert.equal(resolveAdminSection('owner', item.href), item.id);
    assert.ok(item.label);
  }
});

test('catalog and operations see only their permitted sections', () => {
  assert.deepEqual(adminSections('catalog').map(item => item.id), ['products', 'classifications']);
  assert.deepEqual(adminSections('operations').map(item => item.id), ['orders']);
  assert.equal(resolveAdminSection('operations', ''), 'orders');
  assert.equal(resolveAdminSection('catalog', ''), 'products');
});

test('forbidden or malformed deep links never render a restricted section', () => {
  for (const hash of ['#orders', '#editor', '#settings']) assert.equal(resolveAdminSection('catalog', hash), null);
  for (const hash of ['#products', '#classifications', '#editor', '#settings']) assert.equal(resolveAdminSection('operations', hash), null);
  for (const hash of ['#unknown', '#', '#%73ettings', '#settings/extra']) assert.equal(resolveAdminSection('owner', hash), null);
});
