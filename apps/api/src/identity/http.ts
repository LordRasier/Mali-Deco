export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  ip?: string;
}
export interface ResponseLike {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}
export function header(req: RequestLike, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}
export function sessionToken(req: RequestLike): string | undefined {
  const raw = header(req, 'cookie');
  if (!raw || raw.length > 8192) return undefined;
  const matches = raw.split(';').map((x) => x.trim()).filter((x) => x.startsWith('store_admin='));
  return matches.length === 1 ? matches[0].slice('store_admin='.length) : undefined;
}
export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
}
