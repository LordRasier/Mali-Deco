import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { ApiError } from '../../src/presentation/admin/client/api';
import { createAdminWorkspace, type AdminWorkspaceView } from '../../src/presentation/admin/client/browser/admin-workspace';
import type { AdminSection } from '../../src/presentation/admin/client/navigation';

const user = { id: 'owner-1', email: 'owner@example.invalid', role: 'owner' as const };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture(hash = '#products') {
  const events = new Set<() => void>(), oldEvents: (() => void)[] = [], calls: AdminSection[] = [];
  const mounted = new Map<AdminSection, { html: string; draft: string }>();
  const states = new Map<AdminSection, { status: string; message?: string }>();
  let clearCount = 0, current: AdminSection | null = null, focus = 0, passwordCleared = 0;
  let sessionState = 'loading', error = '', busy = false;
  const view: AdminWorkspaceView = {
    session(state, action) { sessionState = state.status; error = action.error; busy = action.busy; },
    reset() { clearCount++; mounted.clear(); states.clear(); },
    navigation(_user, section) { current = section; },
    section(id, state) { states.set(id, state); if (state.status === 'ready') mounted.set(id, { html: state.html, draft: '' }); },
    focus() { focus++; }, clearPassword() { passwordCleared++; },
  };
  const runtime = { hash: () => hash, listen(callback: () => void) { events.add(callback); oldEvents.push(callback); return () => { events.delete(callback); }; },
    loadSection: async (section: AdminSection, signal: AbortSignal) => { assert.equal(signal.aborted, false); calls.push(section); return `<section>${section}</section>`; } };
  return { runtime, view, calls, mounted, states, oldEvents, get clearCount() { return clearCount; }, get current() { return current; },
    get focus() { return focus; }, get passwordCleared() { return passwordCleared; }, get sessionState() { return sessionState; },
    get error() { return error; }, get busy() { return busy; },
    navigate(next: string) { hash = next; for (const event of events) event(); } };
}
function session() {
  return createSessionStore(async path => {
    if (path === '/auth/me' || path === '/auth/login') return { user, csrf: 'login-csrf' } as never;
    if (path === '/auth/csrf') return { csrf: 'csrf' } as never;
    return { ok: true } as never;
  });
}

test('hash navigation retains visited section roots and drafts without refetching them', async () => {
  const f = fixture('#settings'), auth = session(), workspace = createAdminWorkspace(auth, f.view, f.runtime);
  assert.deepEqual(f.calls, []); const stop = workspace.start(); await settle();
  assert.equal(f.current, 'settings'); const original = f.mounted.get('settings')!; original.draft = 'Unsaved name';
  f.navigate('#products'); await settle(); f.navigate('#settings'); await settle();
  assert.equal(f.mounted.get('settings'), original); assert.equal(original.draft, 'Unsaved name');
  assert.deepEqual(f.calls, ['settings', 'products']); assert.equal(f.focus, 3);
  f.navigate('#unknown'); assert.equal(f.current, null); assert.equal(f.mounted.get('settings'), original);
  stop(); assert.equal(f.mounted.size, 0);
});

test('session expiry and changed role clear all drafts and reject late old section responses', async () => {
  const f = fixture(), pending = deferred<string>();
  f.runtime.loadSection = () => pending.promise;
  let role: 'owner' | 'operations' = 'owner';
  const auth = createSessionStore(async path => path === '/auth/csrf' ? { csrf: 'csrf' } as never : { user: { ...user, role }, csrf: 'csrf' } as never);
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  auth.expire(); assert.equal(f.current, null); assert.equal(f.mounted.size, 0);
  role = 'operations'; await auth.login('owner@example.invalid', 'password'); await settle();
  assert.equal(f.current, null); assert.equal(f.sessionState, 'authenticated');
  pending.resolve('old private markup'); await settle(); assert.equal(f.mounted.size, 0);
  f.navigate(''); await settle(); assert.equal(f.current, 'orders'); stop();
});

test('failed and uncertain logout preserve drafts; successful logout clears them', async () => {
  const f = fixture(); let failure = true, logoutCalls = 0;
  const pending = deferred<never>();
  const auth = createSessionStore(async path => {
    if (path === '/auth/logout') { logoutCalls++; if (failure) return pending.promise; return { ok: true } as never; }
    return path === '/auth/csrf' ? { csrf: 'csrf' } as never : { user } as never;
  });
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  const original = f.mounted.get('products')!; original.draft = 'Draft';
  const first = workspace.logout(), second = workspace.logout(); await settle(); assert.equal(logoutCalls, 1);
  pending.reject(new ApiError(0, 'Outcome unknown')); await Promise.all([first, second]);
  assert.equal(f.mounted.get('products'), original); assert.equal(f.sessionState, 'authenticated');
  assert.equal(f.busy, false); assert.match(f.error, /unknown/);
  failure = false; await workspace.logout(); assert.equal(f.sessionState, 'anonymous'); assert.equal(f.mounted.size, 0); stop();
});

test('late section 401 cannot expire a newer login and stopped callbacks do not initiate requests', async () => {
  const f = fixture(), old = deferred<string>(), auth = session(); let calls = 0;
  f.runtime.loadSection = async () => ++calls === 1 ? old.promise : 'new section';
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), oldStop = workspace.start(); await settle();
  oldStop(); const stop = workspace.start(); await settle(); const before = calls;
  f.oldEvents[0](); oldStop(); old.reject(new ApiError(401, 'Old expiry')); await settle();
  assert.equal(calls, before); assert.equal(auth.getSnapshot().status, 'authenticated');
  assert.equal(f.mounted.get('products')?.html, 'new section'); stop();
});

test('section failure is retryable without rebuilding other retained sections', async () => {
  const f = fixture(), auth = session(); let attempts = 0;
  f.runtime.loadSection = async id => { if (id === 'settings' && ++attempts === 1) throw new ApiError(503, 'Unavailable'); return id; };
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  const original = f.mounted.get('products'); f.navigate('#settings'); await settle();
  assert.equal(f.states.get('settings')?.status, 'error'); workspace.retrySection(); await settle();
  assert.equal(f.states.get('settings')?.status, 'ready'); assert.equal(f.mounted.get('products'), original); stop();
});

test('login clears password on success and stale action completion cannot update a stopped view', async () => {
  const f = fixture(), pending = deferred<never>();
  const auth = createSessionStore(async path => {
    if (path === '/auth/me') throw new ApiError(401, 'Anonymous');
    if (path === '/auth/login') return pending.promise;
    return { csrf: 'csrf' } as never;
  });
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  assert.equal(f.sessionState, 'anonymous'); const attempt = workspace.login('owner@example.invalid', 'password');
  pending.resolve({ user, csrf: 'csrf' } as never); await attempt; await settle();
  assert.equal(f.passwordCleared, 1); assert.equal(f.sessionState, 'authenticated'); stop();
  const before = f.clearCount; await workspace.login('ignored', 'ignored'); assert.equal(f.clearCount, before);
});

test('a current section 401 expires the workspace, while an old 401 after a newer login does not', async () => {
  const f = fixture(), old = deferred<string>(), auth = session(); let calls = 0;
  f.runtime.loadSection = async () => ++calls === 1 ? old.promise : 'new section';
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  await auth.login('owner@example.invalid', 'new password'); await settle();
  old.reject(new ApiError(401, 'old')); await settle();
  assert.equal(auth.getSnapshot().status, 'authenticated'); assert.equal(f.mounted.get('products')?.html, 'new section');
  f.runtime.loadSection = async () => { throw new ApiError(401, 'current'); };
  workspace.retrySection(); await settle(); assert.equal(auth.getSnapshot().status, 'anonymous'); assert.equal(f.mounted.size, 0); stop();
});

test('an external newer authentication cannot leave an obsolete login action permanently busy', async () => {
  const f = fixture(), oldLogin = deferred<never>(); let logins = 0;
  const auth = createSessionStore(async path => {
    if (path === '/auth/me') throw new ApiError(401, 'Anonymous');
    if (path === '/auth/login' && ++logins === 1) return oldLogin.promise;
    return { user, csrf: 'new-csrf' } as never;
  });
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  const old = workspace.login('owner@example.invalid', 'old'); await settle();
  const newer = auth.login('owner@example.invalid', 'new');
  oldLogin.resolve({ user, csrf: 'old-csrf' } as never); await Promise.all([old, newer]); await settle();
  assert.equal(f.sessionState, 'authenticated'); assert.equal(f.busy, false); stop();
});

test('synchronous view cleanup prevents an auth request from starting after disposal', async () => {
  const f = fixture(), calls: string[] = [];
  const auth = createSessionStore(async path => { calls.push(path); throw new ApiError(401, 'Anonymous'); });
  const workspace = createAdminWorkspace(auth, f.view, f.runtime), stop = workspace.start(); await settle();
  const renderSession = f.view.session;
  f.view.session = (state, action) => { renderSession(state, action); if (action.busy) stop(); };
  await workspace.login('owner@example.invalid', 'password'); await settle();
  assert.deepEqual(calls, ['/auth/me']);
});
