import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkoutHarnessPolicy } from './checkout-browser-policy';
const valid = { NODE_ENV: 'development', STOREFRONT_MODE: 'api', LOCAL_TEST_CHECKOUT_ENABLED: 'true', CHECKOUT_BROWSER_E2E: '1', DB_HOST: '127.0.0.1', DB_DATABASE: 'store_integration_test', DB_PORT: '3306', DB_USERNAME: 'root', DB_PASSWORD: '', DB_ALLOW_EMPTY_PASSWORD: '1', PORT: '3000', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000' };
test('browser harness policy fails closed without I/O', () => {
  assert.deepEqual(checkoutHarnessPolicy(valid), { port: 3000, origin: 'http://127.0.0.1:3000' });
  for (const override of [
    { CHECKOUT_BROWSER_E2E: undefined }, { NODE_ENV: 'production' }, { LOCAL_TEST_CHECKOUT_ENABLED: undefined }, { DB_HOST: 'localhost' }, { DB_DATABASE: 'store' },
    { ZIPNOVA_ENABLED: 'true' }, { ZIPNOVA_API_KEY: 'inherited' }, { PORT: '0' },
    { PORT: '65536' }, { PORT: '3001' }, { DB_PORT: 'bad' },
    { ZIPNOVA_OPERATOR_ORIGIN: 'http://localhost:3000' }, { ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000/' },
    { DB_PORT: undefined }, { DB_PORT: '3307' }, { DB_USERNAME: 'other' }, { DB_PASSWORD: undefined },
    { DB_PASSWORD: 'secret' }, { DB_ALLOW_EMPTY_PASSWORD: undefined }, { ZIPNOVA_ENABLED: '' },
    { ZIPNOVA_ACCOUNT_ID: '1' }, { zipnova_other: 'x' }, { STOREFRONT_MODE: 'demo' }, { STOREFRONT_MODE: undefined },
    { ZIPNOVA_OPERATOR_ORIGIN: 'https://127.0.0.1:3000' }, { ZIPNOVA_OPERATOR_ORIGIN: 'http://user:pass@127.0.0.1:3000' },
    { ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000/path' }, { ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000?x=1' },
    { ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000#x' }, { PORT: '03000' },
  ]) assert.throws(() => checkoutHarnessPolicy({ ...valid, ...override }));
});
test('single-server harness can use an explicitly configured isolated port without a second origin', () => {
  assert.deepEqual(checkoutHarnessPolicy({ ...valid, PORT: '3191', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3191' }), { port: 3191, origin: 'http://127.0.0.1:3191' });
});
