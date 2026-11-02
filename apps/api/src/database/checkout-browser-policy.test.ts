import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkoutHarnessPolicy } from './checkout-browser-policy';
const valid = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true', CHECKOUT_BROWSER_E2E: '1', DB_HOST: '127.0.0.1', DB_DATABASE: 'store_integration_test', DB_PORT: '3306', DB_USERNAME: 'root', DB_PASSWORD: '', DB_ALLOW_EMPTY_PASSWORD: '1', PORT: '3001', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000' };
test('browser harness policy fails closed without I/O', () => {
  assert.equal(checkoutHarnessPolicy(valid).port, 3001);
  for (const override of [
    { CHECKOUT_BROWSER_E2E: undefined }, { NODE_ENV: 'production' }, { LOCAL_TEST_CHECKOUT_ENABLED: undefined }, { DB_HOST: 'localhost' }, { DB_DATABASE: 'store' },
    { ZIPNOVA_ENABLED: 'true' }, { ZIPNOVA_API_KEY: 'inherited' }, { PORT: '0' },
    { PORT: '65536' }, { PORT: '3000' }, { DB_PORT: 'bad' },
    { ZIPNOVA_OPERATOR_ORIGIN: 'http://localhost:3000' }, { ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000/' },
    { DB_PORT: undefined }, { DB_PORT: '3307' }, { DB_USERNAME: 'other' }, { DB_PASSWORD: undefined },
    { DB_PASSWORD: 'secret' }, { DB_ALLOW_EMPTY_PASSWORD: undefined }, { ZIPNOVA_ENABLED: '' },
    { ZIPNOVA_ACCOUNT_ID: '1' }, { zipnova_other: 'x' },
  ]) assert.throws(() => checkoutHarnessPolicy({ ...valid, ...override }));
});
