import type { AdminSection } from '../navigation';
import type { sessionStore } from '../session-store';

type Mount = (root: HTMLElement, session: typeof sessionStore) => (() => void);
const features = new Map<AdminSection, Mount>();

/** Explicit feature ownership; registration does not mount or access browser state. */
export function registerAdminFeature(section: AdminSection, mount: Mount) {
  if (features.has(section)) throw new Error(`Admin feature already registered: ${section}`);
  features.set(section, mount);
  return () => { if (features.get(section) === mount) features.delete(section); };
}

export function mountAdminFeature(section: AdminSection, root: HTMLElement, session: typeof sessionStore): () => void {
  return features.get(section)?.(root, session) ?? (() => {});
}
