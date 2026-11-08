import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchClassifications, classificationRoute } from '../../src/presentation/admin/client/browser/classifications/classification-runtime';
import { mountClassifications } from '../../src/presentation/admin/client/browser/classifications/classification-dom';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';

test('classification query and metadata keep kind/page/id explicit', async () => {
  const urls: string[] = [];
  await fetchClassifications({ kind: 'colors', view: 'edit', page: 2, id: 'c1' }, new AbortController().signal, async url => {
    urls.push(String(url)); return new Response('<section></section>', { headers: { 'Content-Type': 'text/html' } });
  });
  assert.deepEqual(urls, ['/admin/sections/classifications?view=edit&kind=colors&page=2&id=c1']);
  assert.deepEqual(classificationRoute({ classificationKind: 'colors', classificationView: 'edit', classificationPage: '2', classificationId: 'c1' }), { kind: 'colors', view: 'edit', page: 2, id: 'c1' });
  assert.throws(() => classificationRoute({ classificationKind: 'unknown', classificationView: 'list', classificationPage: '1' }));
});

test('native classification submit preserves values and never repeats an uncertain write', async () => {
  const fields = new Map(Object.entries({ name: ' Coral ', slug: 'coral', sortOrder: '2', hex: '#F47B6B' }).map(([name, value]) => [name, { value, disabled: false }]));
  const form = { matches: (selector: string) => selector === '[data-classification-form]', elements: { namedItem: (name: string) => fields.get(name) } };
  const message = { textContent: '', hidden: true }, loading = { textContent: '', hidden: true }, retry = { hidden: true };
  const elements = new Map<string, unknown>([['[data-classification-message]', message], ['[data-classification-loading]', loading], ['[data-classification-action="retry"]', retry]]);
  const root = Object.assign(new EventTarget(), { dataset: { classificationKind: 'colors', classificationView: 'create' },
    querySelector: (selector: string) => elements.get(selector) ?? null, querySelectorAll: () => [...fields.values()], setAttribute() {} });
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never); await session.login('email', 'password');
  const calls: [string, RequestOptions | undefined][] = [];
  const stop = mountClassifications(root as unknown as HTMLElement, session, { runtime: { confirm: () => true,
    read: async () => { throw Error('unexpected read'); }, request: async (path, options) => { calls.push([path, options]); throw new ApiError(0, 'Unknown outcome'); } } });
  const submit = () => { const event = new Event('submit', { cancelable: true }); Object.defineProperty(event, 'target', { value: form }); root.dispatchEvent(event); return event; };
  assert.equal(submit().defaultPrevented, true); for (let i = 0; i < 14; i++) await Promise.resolve();
  assert.equal(calls.length, 1); assert.equal(fields.get('name')!.value, ' Coral '); assert.equal(fields.get('name')!.disabled, false); assert.match(message.textContent, /Unknown/);
  stop(); submit(); assert.equal(calls.length, 1);
});
