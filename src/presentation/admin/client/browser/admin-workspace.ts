import { ApiError } from '../api';
import { resolveAdminSection, type AdminSection } from '../navigation';
import type { createSessionStore, SessionSnapshot } from '../session-core';
import type { User } from '../types';

type SectionState = { status: 'loading' | 'error'; message?: string } | { status: 'ready'; html: string };
export type AdminWorkspaceView = {
  session(snapshot: SessionSnapshot, action: { busy: boolean; error: string }): void;
  reset(): void;
  navigation(user: User | null, section: AdminSection | null): void;
  section(id: AdminSection, state: SectionState): void;
  focus(): void;
  clearPassword(): void;
};
export type AdminRuntime = {
  hash(): string;
  listen(callback: () => void): () => void;
  loadSection(section: AdminSection, signal: AbortSignal): Promise<string>;
};

/** Retain visited views, not credentials or drafts on disk. Auth remains in the existing session owner. */
export function createAdminWorkspace(session: ReturnType<typeof createSessionStore>, view: AdminWorkspaceView, runtime: AdminRuntime) {
  const sections = new Map<AdminSection, AbortController>();
  let active = false, lifecycle = 0, actionRevision = 0, actionEpoch = 0;
  let identity: string | null = null, selected: AdminSection | null = null;
  let action = { busy: false, error: '' };
  const clear = () => {
    for (const request of sections.values()) request.abort();
    sections.clear(); identity = null; selected = null; view.reset();
  };
  function load(section: AdminSection) {
    if (!active || !identity || sections.has(section)) return;
    const controller = new AbortController(), generation = lifecycle, key = identity, epoch = session.getEpoch();
    sections.set(section, controller);
    const current = () => active && lifecycle === generation && identity === key && session.getEpoch() === epoch
      && sections.get(section) === controller && !controller.signal.aborted;
    view.section(section, { status: 'loading' });
    if (!current()) return;
    void (async () => {
      try {
        const html = await runtime.loadSection(section, controller.signal);
        if (current()) view.section(section, { status: 'ready', html });
      } catch (failure) {
        if (!current()) return;
        if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
        view.section(section, { status: 'error', message: failure instanceof Error ? failure.message : 'No se pudo cargar la sección.' });
      }
    })();
  }
  function navigate(focus = true) {
    const state = session.getSnapshot();
    if (!active || state.status !== 'authenticated' || !state.user) return;
    selected = resolveAdminSection(state.user.role, runtime.hash());
    view.navigation(state.user, selected);
    if (selected) load(selected);
    if (focus) view.focus();
  }
  function render() {
    if (!active) return;
    const state = session.getSnapshot();
    // Another owner can authenticate while this view still awaits an older serialized operation.
    if (action.busy && actionEpoch !== session.getEpoch()) { action = { busy: false, error: '' }; actionRevision++; }
    if (state.status !== 'authenticated' || !state.user) {
      if (identity !== null) { clear(); action = { busy: false, error: '' }; actionRevision++; }
      view.navigation(null, null); view.session(state, action); return;
    }
    const key = JSON.stringify([session.getEpoch(), state.user.id, state.user.role]);
    const changed = key !== identity;
    if (changed) { clear(); identity = key; }
    view.session(state, action); navigate(changed);
  }

  async function authenticate(kind: 'login' | 'logout', email = '', password = '') {
    if (!active || action.busy) return;
    const generation = lifecycle, revision = ++actionRevision;
    let epoch = session.getEpoch(); actionEpoch = epoch;
    const current = () => active && lifecycle === generation && actionRevision === revision && session.getEpoch() === epoch;
    action = { busy: true, error: '' }; view.session(session.getSnapshot(), action);
    if (!current()) return;
    try {
      const operation = kind === 'login' ? session.login(email, password) : session.logout();
      epoch = session.getEpoch(); actionEpoch = epoch;
      await operation;
      if (current() && kind === 'login') view.clearPassword();
    } catch (failure) {
      if (current()) action = { busy: true, error: failure instanceof Error ? failure.message : 'No se pudo completar la operación.' };
    } finally {
      if (current()) { action = { ...action, busy: false }; view.session(session.getSnapshot(), action); }
    }
  }

  function start() {
    if (active) throw new Error('Admin workspace already started');
    active = true; const generation = ++lifecycle;
    const unsubscribe = session.subscribe(render);
    const unlisten = runtime.listen(() => { if (active && generation === lifecycle) navigate(); });
    render(); void session.bootstrap();
    return () => {
      if (!active || generation !== lifecycle) return;
      active = false; lifecycle++; actionRevision++; action = { busy: false, error: '' };
      unsubscribe(); unlisten(); clear(); view.clearPassword();
    };
  }
  return { start, login: (email: string, password: string) => authenticate('login', email, password), logout: () => authenticate('logout'),
    retry: () => { if (active) void session.retry(); },
    retrySection: () => {
      if (!active || !selected) return;
      sections.get(selected)?.abort(); sections.delete(selected); load(selected);
    },
  };
}
