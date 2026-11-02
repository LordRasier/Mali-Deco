import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDataMode } from '../src/lib/data-mode.ts';

test('demo must be explicitly opted in during development', () => {
  assert.equal(selectDataMode({ NODE_ENV: 'development', STOREFRONT_MODE: 'demo' }), 'demo');
  assert.throws(() => selectDataMode({ NODE_ENV: 'production', STOREFRONT_MODE: 'demo' }), /only in development/);
  assert.throws(() => selectDataMode({ NODE_ENV: 'development' }), /API_BASE_URL/);
});
test('API mode requires a configured endpoint and never falls back', () => {
  assert.equal(selectDataMode({ NODE_ENV: 'production', API_BASE_URL: 'http://api:3001' }), 'api');
  assert.throws(() => selectDataMode({ NODE_ENV: 'production', STOREFRONT_MODE: 'api' }), /API_BASE_URL/);
  assert.throws(() => selectDataMode({ NODE_ENV: 'production', STOREFRONT_MODE: 'other', API_BASE_URL: 'http://api' }), /Invalid/);
});
