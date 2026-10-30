'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { sessionStore } from './session-store';
export { canManageCatalog } from './session-store';

/** The singleton store shares one CSRF rotation across StrictMode mounts. */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => { void sessionStore.bootstrap(); }, []);
  return children;
}

export function useSession() {
  const state = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  return {
    ...state,
    login: sessionStore.login,
    logout: sessionStore.logout,
    retry: () => sessionStore.retry(),
    expire: sessionStore.expire,
  };
}
