import type { Product, StorefrontData, Variant } from './storefront-types';

const PAGE_SIZE = 100;
// Explicit safety bounds: the initial UI loads every page before rendering.
const MAX_PRODUCTS = 1_000;
const MAX_VARIANTS_PER_PRODUCT = 1_000;
const DETAIL_CONCURRENCY = 6;

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

function object(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid catalog response: ${context}`);
  return value as JsonObject;
}
function text(value: unknown, context: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`Invalid catalog response: ${context}`);
  return value;
}
function integer(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Invalid catalog response: ${context}`);
  return value as number;
}
function paged(value: unknown, page: number, max: number, field: string) {
  const response = object(value, 'page');
  const total = integer(response.total, 'total');
  if (response.page !== page || response.limit !== PAGE_SIZE || !Array.isArray(response[field])) {
    throw new Error('Invalid catalog pagination response');
  }
  if (total > max) throw new Error(`Catalog exceeds the supported limit of ${max} ${field}.`);
  const items = response[field] as unknown[];
  const expected = Math.max(0, Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE));
  if (items.length !== expected) throw new Error('Catalog changed while loading; please retry.');
  return { response, items, total };
}

function summary(value: unknown) {
  const item = object(value, 'product');
  const slug = text(item.slug, 'product slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid catalog response: product slug');
  return {
    id: text(item.id, 'product id'),
    slug,
    name: text(item.name, 'product name'),
    description: text(item.description, 'product description', true),
  };
}
function parseVariant(value: unknown): Variant {
  const item = object(value, 'variant');
  const currency = text(item.currency, 'currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid catalog response: currency');
  const supplyMode = item.supplyMode;
  if (supplyMode !== null && supplyMode !== 'stock' && supplyMode !== 'made_to_order') {
    throw new Error('Invalid catalog response: supply mode');
  }
  return {
    id: text(item.id, 'variant id'),
    name: text(item.name, 'variant name'),
    priceMinor: integer(item.priceMinor, 'price'),
    currency,
    supplyMode: supplyMode ?? undefined,
  };
}
function unique(items: { id: string }[], context: string) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`Duplicate ${context} in catalog response`);
}

/**
 * API_BASE_URL must include the public API prefix, e.g. http://localhost:3001/api/v1/.
 * No demo fallback is performed on configuration, network, or response errors.
 */
export async function loadApiCatalog(baseUrl: string, fetcher: Fetcher = fetch): Promise<StorefrontData> {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Invalid catalog API base URL');
  }
  async function get(path: string, page?: number): Promise<unknown> {
    const url = new URL(path, base);
    if (page) {
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(PAGE_SIZE));
    }
    let response: Response;
    try {
      response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new Error('Catalog API is unavailable');
    }
    if (!response.ok) throw new Error(`Catalog API returned HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error('Invalid catalog API JSON'); }
  }

  const settings = object(await get('catalog/settings'), 'settings');
  const brand = text(settings.name, 'store name').trim();
  const first = paged(await get('catalog/products', 1), 1, MAX_PRODUCTS, 'items');
  const products = first.items.map(summary);
  for (let page = 2; page <= Math.ceil(first.total / PAGE_SIZE); page++) {
    const next = paged(await get('catalog/products', page), page, MAX_PRODUCTS, 'items');
    if (next.total !== first.total) throw new Error('Catalog changed while loading; please retry.');
    products.push(...next.items.map(summary));
  }
  unique(products, 'product');

  async function detail(product: ReturnType<typeof summary>): Promise<Product> {
    const path = `catalog/products/${encodeURIComponent(product.slug)}`;
    const firstPage = paged(await get(path, 1), 1, MAX_VARIANTS_PER_PRODUCT, 'variants');
    const actual = summary(firstPage.response);
    if (actual.id !== product.id || actual.slug !== product.slug) throw new Error('Catalog changed while loading; please retry.');
    const variants = firstPage.items.map(parseVariant);
    for (let page = 2; page <= Math.ceil(firstPage.total / PAGE_SIZE); page++) {
      const next = paged(await get(path, page), page, MAX_VARIANTS_PER_PRODUCT, 'variants');
      if (next.total !== firstPage.total || summary(next.response).id !== product.id) throw new Error('Catalog changed while loading; please retry.');
      variants.push(...next.items.map(parseVariant));
    }
    unique(variants, 'variant');
    // The public contract has no image or color field. Do not fabricate them.
    return { ...actual, variants };
  }

  const detailed: Product[] = [];
  for (let index = 0; index < products.length; index += DETAIL_CONCURRENCY) {
    detailed.push(...await Promise.all(products.slice(index, index + DETAIL_CONCURRENCY).map(detail)));
  }
  return { brand, products: detailed, mode: 'api' };
}
