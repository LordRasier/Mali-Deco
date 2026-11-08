// This deployment accepts ASCII email addresses; the same representation is used
// by bootstrap, lookup, uniqueness and the account rate-limit key.
export function canonicalEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 255 || !/^[\x21-\x7e]+$/.test(trimmed)) return null;
  const email = trimmed.toLowerCase();
  return /^[^@]+@[^@]+\.[^@]+$/.test(email) ? email : null;
}
