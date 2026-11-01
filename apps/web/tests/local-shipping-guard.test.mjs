import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowLocalShippingProxy } from '../src/lib/local-shipping-guard.ts';

test('the web proxy rejects cross-site and rebound-host requests before forwarding', () => {
  const env = { NODE_ENV: 'development', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000' };
  const headers = new globalThis.Headers({host:'127.0.0.1:3000', origin:'http://127.0.0.1:3000', 'content-type':'application/json', 'sec-fetch-site':'same-origin'});
  const req = { method:'POST', headers };
  assert.equal(allowLocalShippingProxy(req, env), true);
  assert.equal(allowLocalShippingProxy(req, { ...env, NODE_ENV:'production' }), false);
  assert.equal(allowLocalShippingProxy({ ...req, headers:new globalThis.Headers({ ...Object.fromEntries(headers), host:'attacker.example' }) }, env), false);
  assert.equal(allowLocalShippingProxy({ ...req, headers:new globalThis.Headers({ ...Object.fromEntries(headers), origin:'http://attacker.example' }) }, env), false);
  assert.equal(allowLocalShippingProxy({ ...req, headers:new globalThis.Headers({ ...Object.fromEntries(headers), origin:'null' }) }, env), false);
  assert.equal(allowLocalShippingProxy({ ...req, headers:new globalThis.Headers({ ...Object.fromEntries(headers), 'sec-fetch-site':'cross-site' }) }, env), false);
  assert.equal(allowLocalShippingProxy({ ...req, headers:new globalThis.Headers({ ...Object.fromEntries(headers), 'content-type':'text/plain' }) }, env), false);
  assert.equal(allowLocalShippingProxy({ ...req, method:'GET' }, env), false);
});
