import type { sessionStore } from '../../session-store';

type MediaOwner = { dispose(): void; setReadOnly(value: boolean): void; activity?(): 'writing' | 'pending' | 'clear' };
type Mount = (slot: HTMLElement, session: typeof sessionStore, productId: string, readOnly: boolean, options: { initialFiles?: readonly File[]; initialAlts?: readonly string[] }) => MediaOwner;
let mount: Mount | undefined;
export function registerProductMedia(factory: Mount) {
  if (mount) throw new Error('Product media already registered');
  mount = factory; return () => { if (mount === factory) mount = undefined; };
}

/** Retain the exact upload input and intent owner, not reconstructed HTML, across same-product reads. */
export function createProductMedia(session: typeof sessionStore) {
  let current: { id: string; slot: HTMLElement; owner: MediaOwner; readOnly: boolean } | undefined;
  const dispose = () => { current?.owner.dispose(); current = undefined; };
  const setReadOnly = (value: boolean) => {
    if (!current) return;
    // Product archival cannot be undone in this UI; a stale false must not re-enable upload controls.
    current.readOnly ||= value; current.owner.setReadOnly(current.readOnly);
  };
  return {
    activity: () => current?.owner.activity?.() ?? 'clear',
    adopt(slot: HTMLElement | null, productId: string | null, readOnly: boolean, initialFiles?: readonly File[], initialAlts?: readonly string[]): boolean {
      if (current && current.id === productId) {
        if (slot && slot !== current.slot) slot.replaceWith(current.slot);
        current.slot.hidden = !slot; setReadOnly(readOnly); return Boolean(slot);
      }
      dispose();
      if (!slot || !productId || !mount) return false;
      const owner = mount(slot, session, productId, readOnly, { initialFiles, initialAlts });
      current = { id: productId, slot, owner, readOnly }; slot.hidden = false; return true;
    },
    committed(productId: string, archived: boolean) { if (current?.id !== productId) dispose(); else setReadOnly(archived); },
    dispose,
  };
}
