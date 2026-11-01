'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { readSavedPostalCode, ShippingSession } from '../lib/shipping-session';

const Context = createContext<ShippingSession | null>(null);
const storageKey = 'storefront-shipping-postal-code-v1-';

export function ShippingProvider({ children }: { children:ReactNode }) {
  const [session] = useState(() => new ShippingSession());
  useEffect(() => {
    let loadedMode:'api'|'demo'|null=null;
    const syncStorage=() => {
      const current=session.getSnapshot(); if (!current.mode) return;
      try {
        if (loadedMode !== current.mode) { loadedMode=current.mode; session.setPostalCode(readSavedPostalCode(sessionStorage.getItem(storageKey+current.mode)) ?? ''); return; }
        sessionStorage.setItem(storageKey+current.mode,current.postalCode);
      } catch { /* The cart still works without session storage. */ }
    };
    const unsubscribe=session.subscribe(syncStorage); syncStorage();
    const refresh=() => session.expireIfNeeded();
    window.addEventListener('focus',refresh); document.addEventListener('visibilitychange',refresh);
    session.activate();
    return () => { unsubscribe(); window.removeEventListener('focus',refresh); document.removeEventListener('visibilitychange',refresh); session.dispose(); };
  },[session]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}

export function useShipping() {
  const session=useContext(Context);
  if (!session) throw new Error('ShippingProvider is required');
  const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
  return {session,snapshot};
}
