import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harnessFetch } from './checkout-browser-network';

test('test transport reaches only its own loopback API', async () => {
  let calls = 0;
  let redirect: RequestRedirect | undefined;
  const fake: typeof fetch = async (_input, init) => { calls++; redirect = init?.redirect; return new Response('ok'); };
  const request = harnessFetch(fake, 3191);
  assert.equal((await request('http://127.0.0.1:3191/api/v1/health', { redirect: 'follow' })).status, 200);
  assert.equal(redirect, 'error');
  for (const url of ['https://api.example.test/', 'http://localhost:3191/', 'http://127.0.0.1:3192/', 'http://user:pass@127.0.0.1:3191/']) {
    await assert.rejects(request(url));
  }
  assert.equal(calls, 1);
});
