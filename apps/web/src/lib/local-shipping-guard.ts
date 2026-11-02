/** Only allows the experimental quote proxy from its literal local browser origin. */
export function allowLocalShippingProxy(request: { method: string; headers: Headers }, env: { NODE_ENV?: string; ZIPNOVA_OPERATOR_ORIGIN?: string }): boolean {
  if (env.NODE_ENV !== 'development' || !env.ZIPNOVA_OPERATOR_ORIGIN) return false;
  try {
    const origin = new URL(env.ZIPNOVA_OPERATOR_ORIGIN);
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.origin !== env.ZIPNOVA_OPERATOR_ORIGIN || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return false;
    return request.method === 'POST' && request.headers.get('host') === origin.host && request.headers.get('origin') === origin.origin &&
      /^application\/json\s*(?:;|$)/i.test(request.headers.get('content-type') ?? '') && request.headers.get('sec-fetch-site') !== 'cross-site';
  } catch { return false; }
}
