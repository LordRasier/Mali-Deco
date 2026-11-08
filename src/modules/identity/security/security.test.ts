import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPassword, hashPassword, issueSecret, matchesSecret } from './security';

test('password hashes are salted and validate only the correct password', async () => {
  const first = await hashPassword('a-long-temporary-password');
  const second = await hashPassword('a-long-temporary-password');
  assert.notEqual(first, second);
  assert.equal(await checkPassword('a-long-temporary-password', first), true);
  assert.equal(await checkPassword('wrong-password', first), false);
  assert.equal(await checkPassword('anything', 'malformed'), false);
});

test('opaque secrets have separate verifiable digests', () => {
  const issued = issueSecret();
  assert.notEqual(issued.token, issued.hash);
  assert.equal(matchesSecret(issued.token, issued.hash), true);
  assert.equal(matchesSecret('not-a-token', issued.hash), false);
});
