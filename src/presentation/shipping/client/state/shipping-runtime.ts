import { readSavedDestinationHint, readSavedPostalCode, type ShippingSession } from '../../../shared/shipping/shipping-session';

type Environment = {
  storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
};
const postalKey = 'storefront-shipping-postal-code-v1-';
const hintKey = 'storefront-shipping-destination-hint-v1-';

/** One lifecycle per session. Creation is SSR-pure; same-owner resume preserves memory. */
export function createShippingLifecycle(session: ShippingSession, environment?: Environment) {
  let loadedMode: 'api' | 'demo' | null = null, active = false;
  return {
    start() {
      if (active) throw new Error('Shipping lifecycle already started');
      active = true;
      const env = environment ?? { storage: () => sessionStorage, window, document };
      const syncStorage = () => {
        const current = session.getSnapshot(); if (!current.mode) return;
        const hydrate = loadedMode !== current.mode;
        loadedMode = current.mode;
        try {
          const storage = env.storage();
          if (hydrate) {
            session.restoreDestinationHint(readSavedDestinationHint(storage.getItem(hintKey + current.mode)));
            session.setPostalCode(readSavedPostalCode(storage.getItem(postalKey + current.mode)) ?? '');
            return;
          }
          storage.setItem(postalKey + current.mode, current.postalCode);
          const previous = readSavedDestinationHint(storage.getItem(hintKey + current.mode));
          if (current.candidateId && /^\d{4}$/.test(current.postalCode.trim())) {
            storage.setItem(hintKey + current.mode, JSON.stringify({ postalCode: current.postalCode.trim(), candidateId: current.candidateId }));
          } else if (previous && (previous.postalCode !== current.postalCode.trim() || (current.lookup.status === 'ambiguous' && !current.candidateId))) {
            storage.removeItem(hintKey + current.mode);
          }
        } catch { /* Persistence is optional; never replace a live destination after a failed write. */ }
      };
      const unsubscribe = session.subscribe(syncStorage);
      const refresh = () => session.expireIfNeeded();
      syncStorage();
      env.window.addEventListener('focus', refresh); env.document.addEventListener('visibilitychange', refresh);
      session.activate();
      let stopped = false;
      return () => {
        if (stopped) return; stopped = true; active = false;
        unsubscribe(); env.window.removeEventListener('focus', refresh); env.document.removeEventListener('visibilitychange', refresh);
        session.dispose();
      };
    },
  };
}
