import assert from 'node:assert/strict';
import test from 'node:test';
import { localCheckoutPageEnabled, publicPageNoindex } from './presentation-policy';
import { PresentationModule } from './presentation.module';
import type { FactoryProvider } from '@nestjs/common';
import { CheckoutPage } from './checkout/checkout-page';

test('configured checkout receives payment availability without passing secrets into rendering', async () => {
  for (const available of [true, false]) {
    const env = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true', MERCADOPAGO_TEST_ENABLED: String(available),
      MERCADOPAGO_TEST_ACCESS_TOKEN: 'private-test-credential', MERCADOPAGO_TEST_SELLER_ID: '123', MERCADOPAGO_TEST_RETURN_URL: 'https://owned.example.test/return' };
    const module = PresentationModule.configure(env);
    const provider = module.providers!.find(value => typeof value === 'object' && 'provide' in value && value.provide === CheckoutPage) as FactoryProvider<CheckoutPage>;
    const page: CheckoutPage = await provider.useFactory({ settings: async () => ({ name: 'Test shop' }) });
    const { model } = await page.read();
    assert.equal(model.paymentAvailable, available);
    assert.doesNotMatch(JSON.stringify(model), /private-test-credential|MERCADOPAGO|owned.example/);
  }
});

test('permanent rendering never weakens the independent local checkout capability gate', () => {
  assert.equal(localCheckoutPageEnabled({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true' }, 'api'), true);
  for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'production', LOCAL_TEST_CHECKOUT_ENABLED: 'true' },
    ...['false', '1', 'TRUE', ' true ', ''].map(value => ({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: value }))]) {
    assert.equal(localCheckoutPageEnabled(env, 'api'), false);
  }
  assert.equal(localCheckoutPageEnabled({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true' }, 'demo'), false);
});

test('real catalog rendering is permanent and obsolete mode variables do not control startup', () => {
  assert.equal(PresentationModule.configure({ NODE_ENV: 'production', STOREFRONT_MODE: 'api' }).module, PresentationModule);
  assert.equal(PresentationModule.configure({ NODE_ENV: 'development', STOREFRONT_MODE: 'demo' }).module, PresentationModule);
  for (const env of [{}, { NODE_ENV: 'production' }, { NODE_ENV: 'test' }]) assert.equal(PresentationModule.configure({ ...env, STOREFRONT_MODE: 'demo' }).module, PresentationModule);
  assert.equal(PresentationModule.configure({ NODE_ENV: 'development', STOREFRONT_MODE: 'API' }).module, PresentationModule);
});

test('successful public API pages are indexable while demo and failed pages are noindex', () => {
  assert.equal(publicPageNoindex(200, false), false); assert.equal(publicPageNoindex(302, false), false);
  assert.equal(publicPageNoindex(200, true), true); assert.equal(publicPageNoindex(404, false), true); assert.equal(publicPageNoindex(503, false), true);
});
