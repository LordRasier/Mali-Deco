export type Consent = 'accepted' | 'rejected';
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export function analyticsConsent(storage: Storage, key: string, now: () => number = Date.now) {
  const read = (): Consent | null => {
    try { const value = JSON.parse(storage.getItem(key) || 'null'); return value && value.expires > now() && (value.choice === 'accepted' || value.choice === 'rejected') ? value.choice : null; }
    catch { return null; }
  };
  return { read, save(choice: Consent) { try { storage.setItem(key, JSON.stringify({ choice, expires: now() + 180 * 86400000 })); } catch { /* The choice still applies to this page when storage is unavailable. */ } } };
}
