/** Browser/server normalization. Empty means hidden; null means invalid. */
export function normalizeWhatsAppNumber(value: unknown): string | null {
  if (typeof value !== 'string' || /[\p{Cc}]/u.test(value)) return null;
  const raw = value.trim();
  if (!raw) return '';
  if (!/^\+?[\d() -]+$/.test(raw)) return null;
  const number = raw.replace(/[()+ -]/g, '');
  return /^[1-9]\d{7,14}$/.test(number) ? number : null;
}

export function normalizeInstagramUsername(value: unknown): string | null {
  if (typeof value !== 'string' || /[\p{Cc}]/u.test(value)) return null;
  let username = value.trim();
  if (!username) return '';
  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
      username = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch { return null; }
  }
  username = username.replace(/^@/, '');
  return /^[a-zA-Z0-9_](?:[a-zA-Z0-9_.]{0,28}[a-zA-Z0-9_])?$/.test(username) && !username.includes('..') ? username.toLowerCase() : null;
}
