import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminView, mountAdmin } from '../../src/presentation/admin/client/browser/admin-dom';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import type { SessionSnapshot } from '../../src/presentation/admin/client/session-core';

// Controlled DOM ports exercise bindings/retention, not browser parsing, layout or BFCache.
class NodeDouble extends EventTarget {
  hidden = false; disabled = false; value = ''; textContent = ''; focused = 0;
  children: NodeDouble[] = []; attributes = new Map<string, string>();
  ownerDocument = { createElement: () => new NodeDouble() };
  append(...nodes: NodeDouble[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeDouble[]) { this.children = nodes; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  focus() { this.focused++; }
}
function dom() {
  const nodes = new Map<string, NodeDouble>();
  for (const name of ['session-state', 'session-message', 'session-retry', 'login', 'shell', 'login-form', 'email', 'password',
    'login-submit', 'login-error', 'logout', 'logout-error', 'account', 'navigation', 'content', 'unavailable', 'sections', 'skip']) {
    nodes.set(`[data-admin-${name}]`, new NodeDouble());
  }
  const root = Object.assign(new NodeDouble(), { querySelector: (selector: string) => nodes.get(selector) ?? null });
  return { root: root as unknown as HTMLElement, get: (name: string) => nodes.get(`[data-admin-${name}]`)! };
}
const user = { id: 'owner', email: '<img src=x>', role: 'owner' as const };
const authenticated: SessionSnapshot = { status: 'authenticated', user, csrf: 'private-csrf', error: null };

test('DOM view separates auth states, treats account text as text and retains section nodes while hidden', () => {
  const d = dom(), view = createAdminView(d.root);
  view.session(authenticated, { busy: false, error: '' }); view.navigation(user, 'products');
  assert.equal(d.get('shell').hidden, false); assert.equal(d.get('login').hidden, true);
  assert.match(d.get('account').textContent, /<img src=x>/); assert.doesNotMatch(d.get('account').textContent, /private-csrf/);
  assert.equal(d.get('navigation').children.length, 4);
  view.section('products', { status: 'loading' }); const productRoot = d.get('sections').children[0];
  const draft = new NodeDouble(); draft.value = 'Unsaved draft'; productRoot.append(draft);
  view.navigation(user, 'settings'); view.section('settings', { status: 'loading' });
  assert.equal(productRoot.hidden, true); view.navigation(user, 'products');
  assert.equal(d.get('sections').children[0], productRoot); assert.equal(draft.value, 'Unsaved draft'); assert.equal(productRoot.hidden, false);
  view.navigation({ ...user, role: 'operations' }, 'orders'); assert.equal(d.get('navigation').children.length, 1);
  view.reset(); assert.equal(d.get('sections').children.length, 0);
  view.session({ status: 'anonymous', user: null, csrf: null, error: null }, { busy: true, error: 'Wrong credentials' });
  assert.equal(d.get('login').hidden, false); assert.equal(d.get('email').disabled, true); assert.equal(d.get('login-error').textContent, 'Wrong credentials');
});

test('mount binds native submit and skip without changing hashes and removes listeners on disposal', async () => {
  const d = dom(), calls: string[] = []; let hash = '#settings';
  const session = createSessionStore(async path => {
    calls.push(path); if (path === '/auth/me') throw { status: 401 };
    return { user, csrf: 'csrf' } as never;
  });
  const mounted = mountAdmin(d.root, { session, runtime: { hash: () => hash, listen: () => () => {}, loadSection: () => new Promise(() => {}) } });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  d.get('email').value = 'owner@example.invalid'; d.get('password').value = 'password';
  const submit = new Event('submit', { cancelable: true }); d.get('login-form').dispatchEvent(submit);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(submit.defaultPrevented, true); assert.deepEqual(calls, ['/auth/me', '/auth/login']); assert.equal(d.get('password').value, '');
  const skip = new Event('click', { cancelable: true }); d.get('skip').dispatchEvent(skip);
  assert.equal(skip.defaultPrevented, true); assert.equal(hash, '#settings'); assert.ok(d.get('content').focused);
  mounted.dispose(); const before = calls.length; d.get('login-form').dispatchEvent(new Event('submit'));
  assert.equal(calls.length, before); hash = '#products';
});
