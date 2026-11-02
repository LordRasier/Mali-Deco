import type { User } from './types';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';
export interface SessionSnapshot {
  status: SessionStatus;
  user: User | null;
  csrf: string | null;
  error: string | null;
}
type Request = <T>(path: string, options?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; csrf?: string; expireOnUnauthorized?: boolean }) => Promise<T>;

/** A single in-memory store prevents repeated CSRF rotation on StrictMode remounts. */
export function createSessionStore(request: Request) {
  const initial: SessionSnapshot = { status: 'loading', user: null, csrf: null, error: null };
  let snapshot = initial;
  let bootstrapPromise: Promise<void> | undefined;
  let generation = 0;
  let authQueue: Promise<void> = Promise.resolve();
  let logoutPromise: Promise<void> | undefined;
  function serializeAuth(operation: () => Promise<void>): Promise<void> {
    const queued = authQueue.then(operation, operation);
    // A failed operation must not poison the queue.
    authQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }
  const listeners = new Set<() => void>();
  function publish(next: SessionSnapshot) {
    snapshot = next;
    listeners.forEach(listener => listener());
  }
  function expire() {
    generation++;
    bootstrapPromise = undefined;
    publish({ status: 'anonymous', user: null, csrf: null, error: null });
  }
  function bootstrap(): Promise<void> {
    if (bootstrapPromise) return bootstrapPromise;
    if (snapshot.status === 'authenticated' || snapshot.status === 'anonymous') return Promise.resolve();
    const current = generation;
    bootstrapPromise = (async () => {
      try {
        const { user } = await request<{ user: User }>('/auth/me', { expireOnUnauthorized: false });
        // A newer login or explicit expiry supersedes the pending bootstrap.
        if (current !== generation) return;
        const { csrf } = await request<{ csrf: string }>('/auth/csrf', { method: 'POST', expireOnUnauthorized: false });
        if (current === generation) publish({ status: 'authenticated', user, csrf, error: null });
      } catch (error) {
        if (current !== generation) return;
        if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) expire();
        else publish({ status: 'error', user: null, csrf: null, error: error instanceof Error ? error.message : 'No se pudo recuperar la sesión.' });
      } finally {
        if (current === generation) bootstrapPromise = undefined;
      }
    })();
    return bootstrapPromise;
  }
  return {
    getSnapshot: () => snapshot,
    getEpoch: () => generation,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bootstrap,
    login(email: string, password: string): Promise<void> {
      const current = ++generation;
      bootstrapPromise = undefined;
      // The browser applies Set-Cookie before fetch resolves. Serializing ensures a
      // delayed logout or older login cannot overwrite the newest session cookie.
      return serializeAuth(async () => {
        const { user, csrf } = await request<{ user: User; csrf: string }>('/auth/login', { method: 'POST', body: { email, password }, expireOnUnauthorized: false });
        if (current === generation) publish({ status: 'authenticated', user, csrf, error: null });
      });
    },
    logout(): Promise<void> {
      if (logoutPromise) return logoutPromise;
      const csrf = snapshot.csrf;
      const current = generation;
      if (!csrf) return Promise.reject(new Error('No hay un token de seguridad activo.'));
      const operation = serializeAuth(async () => {
        try {
          await request('/auth/logout', { method: 'POST', csrf, expireOnUnauthorized: false });
          if (current === generation) expire();
        } catch (error) {
          if (current === generation && typeof error === 'object' && error !== null && 'status' in error && error.status === 401) expire();
          throw error;
        }
      });
      logoutPromise = operation.finally(() => { logoutPromise = undefined; });
      return logoutPromise;
    },
    retry(): Promise<void> {
      // Rapid retry clicks share the active rotation rather than invalidating it.
      if (snapshot.status === 'loading' && bootstrapPromise) return bootstrapPromise;
      generation++;
      bootstrapPromise = undefined;
      publish(initial);
      return bootstrap();
    },
    expire,
  };
}

export function canManageCatalog(user: User | null): boolean {
  return user?.role === 'owner' || user?.role === 'catalog';
}
