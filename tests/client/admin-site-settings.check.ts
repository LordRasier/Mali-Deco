import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountSiteEditor } from '../../src/presentation/admin/client/browser/settings/site-editor';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { defaultSiteConfig } from '../../src/modules/settings/site-config';

test('admin measurement editor saves IDs with CSRF and revision, preserves conflicting drafts and reloads explicitly', async () => {
  class Control extends EventTarget {
    value = ''; disabled = false; textContent = ''; dataset: Record<string, string> = {}; setAttribute() {}
  }
  const values = { ...defaultSiteConfig(), analyticsMode: 'ga4', ga4Id: 'G-TEST12345' };
  const inputs = new Map(Object.entries(values).map(([key, value]) => [key, Object.assign(new Control(), { value })]));
  inputs.get('analyticsMode')!.dataset.initialValue = 'ga4';
  const fields = new Control(), message = new Control(), reload = new Control();
  const form = Object.assign(new Control(), { dataset: { revision: '0', available: 'true' }, elements: { namedItem: (key: string) => inputs.get(key) },
    querySelector: (selector: string) => ({ '[data-site-fields]': fields, '[data-site-message]': message, '[data-site-reload]': reload })[selector] });
  const root = { querySelector: () => form } as unknown as HTMLElement;
  const session = createSessionStore(async () => ({ user: { id: 'test', email: 'test@example.test', role: 'owner' }, csrf: 'csrf' }) as never);
  await session.login('test', 'test');
  const originalFetch = globalThis.fetch, originalFormData = globalThis.FormData;
  let response = new Response(JSON.stringify({ settings: values, revision: 1, available: true })), calls = 0, submitted: unknown;
  globalThis.FormData = class { [Symbol.iterator]() { return [...inputs].map(([key, control]) => [key, control.value])[Symbol.iterator](); } } as unknown as typeof FormData;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(String(url), '/api/v1/admin/settings/seo');
    if (options?.method === 'PUT') { submitted = JSON.parse(String(options.body)); assert.equal(new Headers(options.headers).get('x-csrf-token'), 'csrf'); }
    return response;
  };
  const dispose = mountSiteEditor(root, session);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    form.dispatchEvent(new Event('submit', { cancelable: true })); assert.equal(fields.disabled, true);
    form.dispatchEvent(new Event('submit', { cancelable: true })); await settle();
    assert.equal(calls, 1); assert.deepEqual(submitted, { settings: values, revision: 0 }); assert.match(message.textContent, /guardada/);
    inputs.get('ga4Id')!.value = 'G-DRAFT123';
    response = new Response(JSON.stringify({ message: 'La configuración cambió' }), { status: 409 });
    form.dispatchEvent(new Event('submit', { cancelable: true })); await settle();
    assert.equal(inputs.get('ga4Id')!.value, 'G-DRAFT123'); assert.equal(calls, 2);
    response = new Response(JSON.stringify({ settings: { ...values, analyticsMode: 'gtm', gtmId: 'GTM-TEST123' }, revision: 2, available: true }));
    reload.dispatchEvent(new Event('click')); await settle();
    assert.equal(inputs.get('analyticsMode')!.value, 'gtm'); assert.equal(inputs.get('gtmId')!.value, 'GTM-TEST123');
    dispose(); form.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); assert.equal(calls, 3); assert.equal(fields.disabled, true);
  } finally { dispose(); globalThis.fetch = originalFetch; globalThis.FormData = originalFormData; }
});
