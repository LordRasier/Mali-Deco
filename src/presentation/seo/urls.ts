import { parseCatalogQuery, catalogQueryParams } from '../catalog/shared/catalog-query';

export function publicOrigin(value?: string): string {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password ? url.origin : ''; }
  catch { return ''; }
}
export const absoluteUrl = (origin: string, path: string) => origin ? new URL(path, origin).href : '';
export function catalogCanonical(path: string, params: URLSearchParams, defaultCurrency: string): string {
  const parsed = parseCatalogQuery(params);
  if (parsed.error) return '';
  const q = parsed.query;
  if (q.currency === defaultCurrency) q.currency = '';
  const query = catalogQueryParams(q).toString();
  return path + (query ? `?${query}` : '');
}
export function serializedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function xmlText(value: string): string { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!); }
