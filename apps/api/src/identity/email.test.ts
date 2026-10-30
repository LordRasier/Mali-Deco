import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalEmail } from './email';

test('login and bootstrap share one canonical ASCII email representation', () => {
  assert.equal(canonicalEmail('  OWNER@Example.COM '), 'owner@example.com');
  assert.equal(canonicalEmail('ówner@example.com'), null);
  assert.equal(canonicalEmail('owner@example.com\u0000'), null);
  assert.equal(canonicalEmail('owner@@example.com'), null);
  assert.equal(canonicalEmail('a'.repeat(250) + '@example.com'), null);
});
