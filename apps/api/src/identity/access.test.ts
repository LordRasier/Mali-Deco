import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorize, requireOrigin } from './access';
import { issueSecret } from './security';

test('expired, revoked, disabled and insufficient-role sessions are rejected', () => {
  const session = { role: 'catalog' as const, expiresAt: new Date('2030-01-01'), revokedAt: null, disabledAt: null };
  const now = new Date('2029-01-01');
  assert.doesNotThrow(() => authorize(session, ['owner', 'catalog'], now));
  assert.throws(() => authorize(session, ['owner'], now));
  assert.throws(() => authorize({ ...session, revokedAt: now }, ['catalog'], now));
  assert.throws(() => authorize({ ...session, disabledAt: now }, ['catalog'], now));
  assert.throws(() => authorize(session, ['catalog'], new Date('2031-01-01')));
});

test('mutations require an exact allowed origin and matching CSRF secret', () => {
  const csrf = issueSecret();
  assert.doesNotThrow(() => requireOrigin('https://admin.example', 'https://admin.example', csrf.token, csrf.hash));
  assert.throws(() => requireOrigin('https://evil.example', 'https://admin.example', csrf.token, csrf.hash));
  assert.throws(() => requireOrigin('https://admin.example', 'https://admin.example', 'wrong', csrf.hash));
});
