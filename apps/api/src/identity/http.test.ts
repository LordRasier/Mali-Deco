import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cookieOptions, sessionToken } from './http';
import { allowedAdminOrigin } from './origin-config';

test('rejects duplicate session cookies and emits restrictive production cookie settings', () => {
  assert.equal(sessionToken({ method: 'GET', headers: { cookie: 'store_admin=a; store_admin=b' } }), undefined);
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.deepEqual(cookieOptions(), { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('production requires a canonical HTTPS admin origin', () => {
  assert.throws(() => allowedAdminOrigin({ NODE_ENV: 'production' }));
  assert.throws(() => allowedAdminOrigin({ NODE_ENV: 'production', ADMIN_ORIGIN: 'http://example.test' }));
  assert.throws(() => allowedAdminOrigin({ ADMIN_ORIGIN: 'https://example.test/path' }));
  assert.equal(allowedAdminOrigin({ NODE_ENV: 'production', ADMIN_ORIGIN: 'https://example.test' }), 'https://example.test');
});
