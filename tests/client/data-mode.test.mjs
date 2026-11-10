import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDataMode } from '../../src/presentation/shared/runtime/data-mode.ts';

test('obsolete demo flags cannot bypass the real catalog endpoint requirement', () => {
  for (const NODE_ENV of ['development', 'production']) {
    assert.throws(() => selectDataMode({ NODE_ENV, STOREFRONT_MODE: 'demo' }), /API_BASE_URL/);
    assert.equal(selectDataMode({ NODE_ENV, STOREFRONT_MODE: 'demo', API_BASE_URL: 'http://api:3001' }), 'api');
  }
});
test('API mode requires a configured endpoint and never falls back', () => {
  assert.equal(selectDataMode({ NODE_ENV: 'production', API_BASE_URL: 'http://api:3001' }), 'api');
  assert.throws(() => selectDataMode({ NODE_ENV: 'production', STOREFRONT_MODE: 'api' }), /API_BASE_URL/);
  assert.equal(selectDataMode({ NODE_ENV: 'production', STOREFRONT_MODE: 'other', API_BASE_URL: 'http://api' }), 'api');
});
