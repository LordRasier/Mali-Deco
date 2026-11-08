import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassifications, type ClassificationRoute, type ClassificationView } from '../../src/presentation/admin/client/browser/classifications/classification-controller';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';

const draft = { name: ' Coral ', slug: 'coral', sortOrder: '2', hex: '#F47B6B' };
const saved = { id: 'c1', name: 'Coral', slug: 'coral', sortOrder: 2, hex: '#F47B6B', archivedAt: null };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
async function fixture(initial: ClassificationRoute = { kind: 'colors', view: 'create' }) {
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never); await session.login('email', 'password');
  const calls: [string, RequestOptions | undefined][] = [], reads: ClassificationRoute[] = []; let error = '', html = 'retained draft', committed = 0, busy = false;
  const view: ClassificationView = { error(text) { error = text; }, render(value) { html = value; }, loading() {}, busy(value) { busy = value; }, focus() {}, committed() { html = 'saved notice'; committed++; } };
  const runtime = { request: async (path: string, options?: RequestOptions) => { calls.push([path, options]); return saved as never; },
    read: async (route: ClassificationRoute) => { reads.push(route); return 'server list'; }, confirm: () => true };
  return { session, calls, reads, view, runtime, initial, get error() { return error; }, get html() { return html; }, get committed() { return committed; }, get busy() { return busy; } };
}

test('classification create/update reuse canonical payloads and never write immutable slug during edit', async () => {
  for (const editing of [false, true]) {
    const f = await fixture(editing ? { kind: 'colors', view: 'edit', id: 'c1', page: 2 } : undefined);
    const editor = createClassifications(f.session, f.view, f.runtime, f.initial); await editor.save(draft);
    assert.deepEqual(f.calls[0], [`/admin/catalog/colors${editing ? '/c1' : ''}`, { method: editing ? 'PUT' : 'POST', csrf: 'csrf', body: { name: 'Coral', sortOrder: 2, hex: '#F47B6B', ...(editing ? {} : { slug: 'coral' }) } }]);
    assert.equal(f.committed, 1); assert.deepEqual(f.reads, [{ kind: 'colors', view: 'list', page: 1 }]); editor.dispose();
  }
});

test('classification validation, conflicts and uncertain responses preserve drafts without write replay', async () => {
  const f = await fixture(), editor = createClassifications(f.session, f.view, f.runtime, f.initial);
  await editor.save({ ...draft, sortOrder: '-1' }); assert.equal(f.calls.length, 0); assert.match(f.error, /entero/);
  f.runtime.request = async (path, options) => { f.calls.push([path, options]); throw new ApiError(409, 'In use or conflicting'); };
  await editor.save(draft); editor.retry(); await settle(); assert.equal(f.calls.length, 1); assert.equal(f.html, 'retained draft'); assert.match(f.error, /conflicting/);
  f.runtime.request = async () => ({ ...saved, sortOrder: ['2'] }) as never; await editor.save(draft); assert.equal(f.committed, 0); assert.match(f.error, /confirmar/); editor.dispose();
});

test('archive requires confirmation, accepts only empty acknowledgement and never offers restore', async () => {
  const f = await fixture({ kind: 'materials', view: 'list', page: 2 }); f.runtime.confirm = () => false;
  const editor = createClassifications(f.session, f.view, f.runtime, f.initial); await editor.archive('c1'); assert.equal(f.calls.length, 0);
  f.runtime.confirm = () => true; f.runtime.request = async (path, options) => { f.calls.push([path, options]); return undefined as never; };
  await editor.archive('c1'); assert.deepEqual(f.calls[0], ['/admin/catalog/materials/c1', { method: 'DELETE', csrf: 'csrf' }]);
  assert.equal('restore' in editor, false); editor.dispose();
});

test('editing blocks classification-kind switches until cancel, and successful writes remove forms before fallible reads', async () => {
  const f = await fixture({ kind: 'colors', view: 'edit', id: 'c1', page: 2 }), editor = createClassifications(f.session, f.view, f.runtime, f.initial);
  await editor.kind('materials'); assert.deepEqual(f.reads, []); await editor.cancel(); assert.deepEqual(f.reads[0], { kind: 'colors', view: 'list', page: 2 }); editor.dispose();
  const g = await fixture(); g.runtime.read = async route => { g.reads.push(route); throw new ApiError(503, 'Read failure'); };
  const creating = createClassifications(g.session, g.view, g.runtime, g.initial); await creating.save(draft); assert.equal(g.html, 'saved notice');
  await creating.save(draft); assert.equal(g.calls.length, 1); creating.retry(); await settle(); assert.equal(g.calls.length, 1); creating.dispose();
});

test('late writes and synchronous cleanup cannot mutate a detached classification editor', async () => {
  const f = await fixture(), wait = deferred<never>(); f.runtime.request = () => wait.promise;
  const editor = createClassifications(f.session, f.view, f.runtime, f.initial), operation = editor.save(draft);
  editor.dispose(); wait.resolve(saved as never); await operation; assert.equal(f.committed, 0);
  const g = await fixture(), next = createClassifications(g.session, g.view, g.runtime, g.initial);
  g.view.busy = value => { if (value) next.dispose(); }; await next.save(draft); assert.equal(g.calls.length, 0);
});
