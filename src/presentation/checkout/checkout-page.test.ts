import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { CheckoutPage } from './checkout-page';

const enabled = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true' };
test('checkout exposes only a safe boolean for configured test payment availability', async () => {
  const env = { ...enabled, MERCADOPAGO_TEST_ENABLED: 'true', MERCADOPAGO_TEST_ACCESS_TOKEN: 'private-fixture-token', MERCADOPAGO_TEST_SELLER_ID: '123', MERCADOPAGO_TEST_RETURN_URL: 'https://owned.example.test/return' };
  const result = await new CheckoutPage({ settings: async () => ({ name: 'Brand' }) }, 'api', env).read();
  assert.equal(result.model.paymentAvailable, true);
  assert.doesNotMatch(JSON.stringify(result.model), /private-fixture|123|owned.example/);
});
test('checkout is API-only and requires every explicit development gate before reading settings', async () => {
  let reads = 0; const catalog = { settings: async () => { reads++; return { name: 'Brand' }; } };
  for (const [mode, env] of [
    ['demo', enabled], ['api', {}], ['api', { ...enabled, NODE_ENV: 'production' }],
    ['api', { ...enabled, NODE_ENV: 'test' }], ['api', { ...enabled, LOCAL_TEST_CHECKOUT_ENABLED: '1' }],
  ] as const) await assert.rejects(new CheckoutPage(catalog, mode, env).read(), NotFoundException);
  assert.equal(reads, 0);
});
test('checkout SSR includes public branding only, with no session/attempt bootstrap', async () => {
  const result = await new CheckoutPage({ settings: async () => ({ name: '<script>Brand</script>', privateSetting: 'secret' }) }, 'api', enabled).read();
  assert.equal(result.status, 200); assert.equal(result.model.brand, '<script>Brand</script>'); assert.equal(result.model.ready, true);
  assert.equal(result.model.mode, 'api'); assert.equal(result.model.checkoutEnabled, false);
  assert.doesNotMatch(JSON.stringify(result.model), /secret|csrf|cookie|pending|sessionToken/);
});
test('branding failure renders an unavailable checkout without a form or leaked cause', async () => {
  const result = await new CheckoutPage({ settings: async () => { throw Error('private DB error'); } }, 'api', enabled).read();
  assert.equal(result.status, 503); assert.equal(result.model.ready, false); assert.doesNotMatch(JSON.stringify(result.model), /private DB/);
});
