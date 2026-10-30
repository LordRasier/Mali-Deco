/**
 * Only the local development server proxies the API. Production requires a
 * same-origin ingress; never expose the Nest origin to the browser as a secret.
 */
function developmentApiOrigin() {
  const value = globalThis.process.env.DEV_API_PROXY_ORIGIN ?? 'http://127.0.0.1:3001';
  let parsed;
  try {
    parsed = new globalThis.URL(value);
  } catch {
    throw new Error('DEV_API_PROXY_ORIGIN debe ser un origen HTTP(S) válido');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || value !== parsed.origin) {
    throw new Error('DEV_API_PROXY_ORIGIN debe ser un origen HTTP(S) canónico, sin ruta, credenciales, consulta ni fragmento');
  }
  return parsed.origin;
}

const config = {
  async rewrites() {
    if (globalThis.process.env.NODE_ENV !== 'development') return [];
    return [{
      source: '/api/v1/:path*',
      destination: `${developmentApiOrigin()}/api/v1/:path*`,
    }];
  },
};

export default config;
