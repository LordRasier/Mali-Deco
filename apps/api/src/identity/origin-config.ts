export function allowedAdminOrigin(env: NodeJS.ProcessEnv): string {
  const value = env.ADMIN_ORIGIN;
  if (!value) {
    if (env.NODE_ENV === 'production') throw new Error('ADMIN_ORIGIN is required in production');
    return '';
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('ADMIN_ORIGIN must be an origin URL'); }
  if (url.origin !== value || !['http:', 'https:'].includes(url.protocol) || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('ADMIN_ORIGIN must be a canonical origin with HTTPS in production');
  }
  return value;
}
