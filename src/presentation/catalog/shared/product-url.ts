export function canonicalProductUrl(origin: string | undefined, slug: string): string | undefined {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
    return new URL(`/productos/${encodeURIComponent(slug)}`, url).href;
  } catch { return undefined; }
}
