type LocalRequest = { method?: string; headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } };

export function localOperatorOrigin(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV !== 'development' || !env.ZIPNOVA_OPERATOR_ORIGIN) return null;
  try {
    const url = new URL(env.ZIPNOVA_OPERATOR_ORIGIN);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.origin !== env.ZIPNOVA_OPERATOR_ORIGIN || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

/** Limits the experimental endpoint to the local browser and local processes, not production authentication. */
export function isLocalQuoteRequest(request: LocalRequest, env: NodeJS.ProcessEnv): boolean {
  const origin = localOperatorOrigin(env);
  const port = env.PORT ?? '3001';
  if (!origin || !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) return false;
  const localHost = new URL(origin).host;
  const apiHost = `127.0.0.1:${port}`;
  return request.method === 'POST' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') &&
    (request.headers.host === localHost || request.headers.host === apiHost) && request.headers.origin === origin &&
    typeof request.headers['content-type'] === 'string' && /^application\/json\s*(?:;|$)/i.test(request.headers['content-type']) &&
    request.headers['sec-fetch-site'] !== 'cross-site';
}
