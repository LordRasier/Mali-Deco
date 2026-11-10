import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MVC_CART_MODE } from './cart-mode';
import { PresentationModule } from '../presentation.module';

test('public storefront has one data source even with obsolete mode variables', () => {
  for (const STOREFRONT_MODE of [undefined, 'api', 'demo', '', 'DEMO', 'other']) {
    for (const NODE_ENV of [undefined, 'development', 'test', 'production']) {
      const providers = PresentationModule.configure({ NODE_ENV, STOREFRONT_MODE }).providers ?? [];
      const source = providers.find(provider => typeof provider === 'object' && 'provide' in provider && provider.provide === MVC_CART_MODE);
      assert.ok(source && typeof source === 'object' && 'useValue' in source);
      assert.equal(source.useValue, 'api');
    }
  }
});
