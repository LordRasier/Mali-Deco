/** Keep campaign labels for attribution; omit searches, contacts, IDs and arbitrary parameters. */
export function measurementLocation(href: string): string {
  const url = new URL(href), result = new URL(url.origin + url.pathname);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id']) {
    const values = url.searchParams.getAll(key);
    if (values.length === 1 && /^[\p{L}\p{N} _.-]{1,120}$/u.test(values[0])) result.searchParams.set(key, values[0]);
  }
  return result.href;
}
