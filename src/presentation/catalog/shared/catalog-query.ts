import { currencyFractionDigits, decimalToMinor, minorToDecimal } from './money';
export type CatalogSort = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
export type CatalogQuery = {
  search: string; category: string[]; material: string[]; color: string[];
  currency: string; minPriceMinor: string; maxPriceMinor: string; sort: CatalogSort; page: number;
};
export const emptyCatalogQuery = (): CatalogQuery => ({ search: '', category: [], material: [], color: [], currency: '', minPriceMinor: '', maxPriceMinor: '', sort: 'name_asc', page: 1 });
const sorts: CatalogSort[] = ['name_asc', 'name_desc', 'price_asc', 'price_desc'];
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reject malformed links instead of broadening a user's shared filter silently. */
export function parseCatalogQuery(params: URLSearchParams): { query: CatalogQuery; error: string | null } {
  const q = emptyCatalogQuery();
  const one = (key: string) => { const values = params.getAll(key); if (values.length > 1) throw new Error(); return values[0] ?? ''; };
  try {
    const allowed = new Set(['search', 'category', 'material', 'color', 'currency', 'minPriceMinor', 'maxPriceMinor', 'sort', 'page']);
    const attribution = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid']);
    for (const [key, value] of params) if (!allowed.has(key) && (!attribution.has(key) || value.length > 500 || params.getAll(key).length > 1 || /[\p{Cc}]/u.test(value))) throw new Error();
    // Search may be blank; defined empty filters and pagination are invalid at the API boundary.
    for (const key of ['category', 'material', 'color', 'currency', 'minPriceMinor', 'maxPriceMinor', 'sort', 'page']) {
      if (params.has(key) && one(key) === '') throw new Error();
    }
    q.search = one('search').trim();
    if (q.search.length > 100) throw new Error();
    for (const key of ['category', 'material', 'color'] as const) {
      const raw = one(key);
      const values = raw ? raw.split(',') : [];
      if (values.length > 20 || values.some(v => v.length > 80 || !slug.test(v)) || new Set(values).size !== values.length) throw new Error();
      q[key] = values;
    }
    q.currency = one('currency');
    if (q.currency && !/^[A-Z]{3}$/.test(q.currency)) throw new Error();
    for (const key of ['minPriceMinor', 'maxPriceMinor'] as const) {
      const raw = one(key);
      if (raw && (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))) throw new Error();
      q[key] = raw;
    }
    const sort = one('sort');
    if (sort && !sorts.includes(sort as CatalogSort)) throw new Error();
    q.sort = (sort || 'name_asc') as CatalogSort;
    const page = one('page');
    if (page && (!/^[1-9]\d*$/.test(page) || Number(page) > 10000)) throw new Error();
    q.page = page ? Number(page) : 1;
    if ((q.minPriceMinor || q.maxPriceMinor || q.sort.startsWith('price_')) && !q.currency) throw new Error();
    if (q.minPriceMinor && q.maxPriceMinor && BigInt(q.minPriceMinor) > BigInt(q.maxPriceMinor)) throw new Error();
    return { query: q, error: null };
  } catch { return { query: emptyCatalogQuery(), error: 'Este enlace contiene filtros inválidos. Borrá los filtros para continuar.' }; }
}
/** Invalid URLs require an explicit clear before changes can broaden the query. */
export function canMutateCatalog(parsed: ReturnType<typeof parseCatalogQuery> | null): boolean {
  return !!parsed && !parsed.error;
}
export function catalogQueryParams(q: CatalogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.search) p.set('search', q.search);
  for (const key of ['category', 'material', 'color'] as const) if (q[key].length) p.set(key, q[key].join(','));
  if (q.currency) p.set('currency', q.currency);
  if (q.minPriceMinor) p.set('minPriceMinor', q.minPriceMinor);
  if (q.maxPriceMinor) p.set('maxPriceMinor', q.maxPriceMinor);
  if (q.sort !== 'name_asc') p.set('sort', q.sort);
  if (q.page !== 1) p.set('page', String(q.page));
  return p;
}
/** Decimal text to exact minor units; no binary floating point or grouping separators. */
export function displayPriceToMinor(input: string, currency: string): string {
  const raw = input.trim();
  if (!raw) return '';
  if (!currency) throw new Error('Elegí una moneda.');
  return String(decimalToMinor(raw, currency));
}
export function minorToDisplayPrice(value: string, currency: string): string {
  if (!value || !currency) return '';
  // Reuse the same precision and integer conversion as admin prices.
  currencyFractionDigits(currency);
  return minorToDecimal(value, currency).replace('.', ',');
}
