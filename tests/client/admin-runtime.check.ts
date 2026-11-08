import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAdminSection } from '../../src/presentation/admin/client/browser/admin-runtime';
import { ApiError } from '../../src/presentation/admin/client/api';

test('section reads use only same-origin guarded HTML and send neither CSRF nor mutation headers', async () => {
  const signal = new AbortController().signal, calls: unknown[] = [];
  const html = '<section data-admin-section="products">Products</section>';
  const result = await fetchAdminSection('products', signal, async (url, options) => {
    calls.push([url, options]); return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  assert.equal(result, html);
  assert.deepEqual(calls, [['/admin/sections/products', { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal }]]);
});

test('fragment HTTP failures retain their status for current-epoch session expiry without retries', async () => {
  for (const status of [401, 403, 404, 503]) {
    let calls = 0;
    await assert.rejects(fetchAdminSection('products', new AbortController().signal, async () => {
      calls++; return new Response('private error details', { status });
    }), failure => failure instanceof ApiError && failure.status === status && !failure.message.includes('private'));
    assert.equal(calls, 1);
  }
});

test('invalid HTML responses and interrupted body reads are explicit failures', async () => {
  const signal = new AbortController().signal;
  for (const response of [new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    new Response('', { headers: { 'Content-Type': 'text/html' } }),
    new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'text/html' } })]) {
    await assert.rejects(fetchAdminSection('orders', signal, async () => response), failure => failure instanceof ApiError && failure.status === 502);
  }
  await assert.rejects(fetchAdminSection('orders', signal, async () => { throw Error('private network detail'); }),
    failure => failure instanceof ApiError && failure.status === 0 && !failure.message.includes('private'));
  const bodyFailure = new Response('valid', { headers: { 'Content-Type': 'text/html' } });
  bodyFailure.text = async () => { throw Error('interrupted'); };
  await assert.rejects(fetchAdminSection('orders', signal, async () => bodyFailure), failure => failure instanceof ApiError && failure.status === 0);
});

test('HTML escaping of a valid maximum-length product description does not exceed the fragment allowance', async () => {
  const html = `<section>${'&lt;'.repeat(65535)}</section>`;
  assert.equal(await fetchAdminSection('products', new AbortController().signal,
    async () => new Response(html, { headers: { 'Content-Type': 'text/html' } })), html);
});
