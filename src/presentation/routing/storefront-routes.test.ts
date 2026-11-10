import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalRoutes, storefrontRoutes } from './storefront-routes';
test('canonical storefront routes are fixed, immutable and independent of flags or requests', () => {
  assert.deepEqual(storefrontRoutes(), { home: '/', catalog: '/catalogo', product: '/productos', cart: '/carrito' });
  assert.equal(storefrontRoutes(), canonicalRoutes); assert.equal(Object.isFrozen(canonicalRoutes), true);
});
