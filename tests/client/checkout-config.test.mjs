import test from 'node:test';
import assert from 'node:assert/strict';
import { localCheckoutEnabled } from '../../src/presentation/shared/checkout/checkout-config.ts';

test('local checkout is available only after explicit development opt-in', () => {
  assert.equal(localCheckoutEnabled({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true' }), true);
  assert.equal(localCheckoutEnabled({ NODE_ENV: 'production', LOCAL_TEST_CHECKOUT_ENABLED: 'true' }), false);
  assert.equal(localCheckoutEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(localCheckoutEnabled({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'false' }), false);
});
