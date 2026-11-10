import { adminSections, type AdminSection } from '../navigation';
import { sessionStore } from '../session-store';
import { browserAdminRuntime } from './admin-runtime';
import { createAdminWorkspace, type AdminRuntime, type AdminWorkspaceView } from './admin-workspace';
import { mountAdminFeature } from './admin-features';
import { readAdminSection } from './admin-fragment';

function required<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const element = root.querySelector<T>(`[data-admin-${name}]`);
  if (!element) throw new Error(`Missing admin element: ${name}`);
  return element;
}

export function createAdminView(root: HTMLElement, session = sessionStore): AdminWorkspaceView {
  const get = <T extends HTMLElement>(name: string) => required<T>(root, name);
  const login = get('login'), shell = get('shell'), state = get('session-state'), message = get('session-message');
  const retry = get('session-retry'), loginError = get('login-error'), logoutError = get('logout-error');
  const email = get<HTMLInputElement>('email'), password = get<HTMLInputElement>('password');
  const loginSubmit = get<HTMLButtonElement>('login-submit'), logout = get<HTMLButtonElement>('logout');
  const nav = get('navigation'), account = get('account'), content = get('content'), unavailable = get('unavailable'), list = get('sections');
  const sections = new Map<AdminSection, HTMLElement>(), links = new Map<AdminSection, HTMLElement>();
  const features = new Map<AdminSection, () => void>();
  let navigationKey = '', selected: AdminSection | null = null;
  return {
    session(snapshot, action) {
      login.hidden = snapshot.status !== 'anonymous'; shell.hidden = snapshot.status !== 'authenticated';
      state.hidden = snapshot.status !== 'loading' && snapshot.status !== 'error'; retry.hidden = snapshot.status !== 'error';
      message.textContent = snapshot.status === 'error' ? snapshot.error ?? 'No se pudo comprobar la sesión.' : 'Comprobando sesión…';
      message.setAttribute('role', snapshot.status === 'error' ? 'alert' : 'status');
      loginError.textContent = login.hidden ? '' : action.error; loginError.hidden = !loginError.textContent;
      logoutError.textContent = shell.hidden ? '' : action.error; logoutError.hidden = !logoutError.textContent;
      email.disabled = password.disabled = loginSubmit.disabled = action.busy || login.hidden;
      logout.disabled = action.busy || shell.hidden; logout.textContent = action.busy ? 'Cerrando sesión…' : 'Cerrar sesión';
      loginSubmit.textContent = action.busy ? 'Ingresando…' : 'Iniciar sesión';
    },
    reset() {
      root.removeAttribute('data-active-section');
      for (const dispose of features.values()) dispose(); features.clear();
      list.replaceChildren(); sections.clear(); nav.replaceChildren(); links.clear(); navigationKey = ''; account.textContent = ''; selected = null;
    },
    navigation(user, section) {
      root.setAttribute('data-active-section', section ?? '');
      selected = section; unavailable.hidden = !user || section !== null;
      const key = user ? JSON.stringify([user.id, user.role]) : '';
      if (key !== navigationKey) {
        navigationKey = key; nav.replaceChildren(); links.clear();
        if (user) for (const item of adminSections(user.role)) {
          const link = root.ownerDocument.createElement('a'); link.setAttribute('href', item.href); link.setAttribute('data-admin-nav-link', '');
          link.textContent = item.label; links.set(item.id, link); nav.append(link);
        }
      }
      account.textContent = user ? `${user.email} · ${{ owner: 'Propietario', catalog: 'Catálogo', operations: 'Operaciones' }[user.role]}` : '';
      for (const [id, link] of links) { if (id === section) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
      for (const [id, node] of sections) node.hidden = id !== section;
    },
    section(id, sectionState) {
      let container = sections.get(id);
      if (!container) { container = root.ownerDocument.createElement('div'); sections.set(id, container); list.append(container); }
      container.hidden = selected !== id;
      if (sectionState.status === 'ready') {
        const section = readAdminSection(root.ownerDocument, id, sectionState.html);
        features.get(id)?.(); features.delete(id); container.replaceChildren(section);
        features.set(id, mountAdminFeature(id, section, session)); return;
      }
      features.get(id)?.(); features.delete(id);
      const notice = root.ownerDocument.createElement('p');
      notice.setAttribute('role', sectionState.status === 'error' ? 'alert' : 'status');
      notice.textContent = sectionState.status === 'error' ? sectionState.message ?? 'No se pudo cargar la sección.' : 'Cargando sección…';
      container.replaceChildren(notice);
      if (sectionState.status === 'error') {
        const button = root.ownerDocument.createElement('button'); button.setAttribute('type', 'button');
        button.setAttribute('data-admin-section-retry', ''); button.textContent = 'Reintentar'; container.append(button);
      }
    },
    focus: () => content.focus(), clearPassword: () => { password.value = ''; },
  };
}

/** Bind an already-rendered shell. Cleanup removes listeners and all sensitive section DOM. */
export function mountAdmin(root: HTMLElement, options: { session?: typeof sessionStore; runtime?: AdminRuntime } = {}) {
  const session = options.session ?? sessionStore;
  const view = createAdminView(root, session), workspace = createAdminWorkspace(session, view, options.runtime ?? browserAdminRuntime);
  const login = required<HTMLFormElement>(root, 'login-form'), logout = required(root, 'logout'), retry = required(root, 'session-retry');
  const skip = required(root, 'skip'), sections = required(root, 'sections');
  const submit = (event: Event) => {
    event.preventDefault(); void workspace.login(required<HTMLInputElement>(root, 'email').value, required<HTMLInputElement>(root, 'password').value);
  };
  const signOut = () => { void workspace.logout(); }, again = () => workspace.retry();
  const focus = (event: Event) => { event.preventDefault(); view.focus(); };
  const retrySection = (event: Event) => {
    if ((event.target as Element | null)?.closest('[data-admin-section-retry]')) workspace.retrySection();
  };
  login.addEventListener('submit', submit); logout.addEventListener('click', signOut); retry.addEventListener('click', again);
  skip.addEventListener('click', focus); sections.addEventListener('click', retrySection);
  const stop = workspace.start();
  return { dispose() {
    stop(); login.removeEventListener('submit', submit); logout.removeEventListener('click', signOut); retry.removeEventListener('click', again);
    skip.removeEventListener('click', focus); sections.removeEventListener('click', retrySection);
  } };
}
