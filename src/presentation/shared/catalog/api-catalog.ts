import type { CatalogQuery } from './catalog-query';
import { catalogQueryParams } from './catalog-query';
import type { CatalogImage, CatalogPage, ColorLookup, Facets, Lookup, PriceRange, Product, StorefrontData, Variant } from './storefront-types';

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;
export class CatalogHttpError extends Error {
  constructor(readonly status: number) { super(`La API del catálogo respondió HTTP ${status}.`); }
}
function object(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Respuesta inválida del catálogo: ${context}`);
  return value as JsonObject;
}
function text(value: unknown, context: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`Respuesta inválida del catálogo: ${context}`);
  return value;
}
function integer(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Respuesta inválida del catálogo: ${context}`);
  return value as number;
}
function currencyCode(value: unknown): string {
  const currency = text(value, 'moneda');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Respuesta inválida del catálogo: moneda');
  return currency;
}
function parseLookup(value: unknown, withColor = false): Lookup | ColorLookup | null {
  if (value === null) return null;
  const item = object(value, 'clasificación');
  const slug = text(item.slug, 'slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Respuesta inválida del catálogo: slug');
  const result: Lookup = { id: text(item.id, 'id'), slug, name: text(item.name, 'nombre') };
  if (item.sortOrder !== undefined) result.sortOrder = integer(item.sortOrder, 'orden');
  if (!withColor) return result;
  if (item.hex !== null && (typeof item.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.hex))) throw new Error('Respuesta inválida del catálogo: color');
  return { ...result, hex: item.hex as string | null };
}
function parseRange(value: unknown): PriceRange | null {
  if (value === null) return null;
  const range = object(value, 'rango de precios');
  const minMinor = integer(range.minMinor, 'precio mínimo'), maxMinor = integer(range.maxMinor, 'precio máximo');
  if (minMinor > maxMinor) throw new Error('Respuesta inválida del catálogo: rango de precios');
  return { currency: currencyCode(range.currency), minMinor, maxMinor };
}
export function parseVariant(value: unknown): Variant {
  const item = object(value, 'variante');
  if (item.supplyMode !== null && item.supplyMode !== 'stock' && item.supplyMode !== 'made_to_order') throw new Error('Respuesta inválida del catálogo: abastecimiento');
  if (item.stockQuantity !== undefined && (!Number.isSafeInteger(item.stockQuantity) || Number(item.stockQuantity) < 0 || Number(item.stockQuantity) > 1000000)) throw new Error('Stock de catálogo inválido');
  const material = parseLookup(item.material) as Lookup | null;
  const colorInfo = parseLookup(item.color, true) as ColorLookup | null;
  let options: { name: string; value: string }[] | undefined;
  if (item.options !== undefined) {
    if (!Array.isArray(item.options) || item.options.length > 8) throw new Error('Propiedades de variante inválidas');
    options = item.options.map(value => { const option = object(value, 'propiedad');
      const name = text(option.name, 'propiedad'), content = text(option.value, 'valor');
      if (name.length > 60 || content.length > 100) throw new Error('Propiedad de variante inválida');
      return { name, value: content }; });
  }
  return { id: text(item.id, 'variante id'), name: text(item.name, 'variante nombre'), priceMinor: integer(item.priceMinor, 'precio'), currency: currencyCode(item.currency), supplyMode: item.supplyMode ?? undefined, ...(item.stockQuantity !== undefined ? { stockQuantity: Number(item.stockQuantity) } : {}), ...(options ? { options } : {}), material, colorInfo, color: colorInfo?.hex ?? undefined };
}
export function parseCatalogImage(value: unknown): CatalogImage | null {
  if (value == null) return null;
  const image = object(value, 'imagen');
  if (typeof image.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(image.id) || typeof image.alt !== 'string' || !Number.isSafeInteger(image.width) || (image.width as number) <= 0 || !Number.isSafeInteger(image.height) || (image.height as number) <= 0) throw new Error('Imagen de catálogo inválida');
  return { id: image.id, alt: image.alt, width: image.width as number, height: image.height as number };
}
function parseImages(value: unknown): CatalogImage[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error('Imágenes de catálogo inválidas');
  const images = value.map(parseCatalogImage);
  if (images.some(image => !image) || new Set(images.map(image => image!.id)).size !== images.length) throw new Error('Imágenes de catálogo inválidas');
  return images as CatalogImage[];
}
function productBase(value: unknown): Omit<Product, 'variants'> {
  const item = object(value, 'producto');
  const slug = text(item.slug, 'producto slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Respuesta inválida del catálogo: producto slug');
  return { id: text(item.id, 'producto id'), slug, name: text(item.name, 'producto nombre'), description: text(item.description, 'descripción', true), ...parseBulkWarning(item) };
}
function pageMeta(value: unknown, page: number, limit: number, field: string) {
  const response = object(value, 'página');
  const total = integer(response.total, 'total');
  if (response.page !== page || response.limit !== limit || !Array.isArray(response[field])) throw new Error('Respuesta de paginación inválida');
  const items = response[field] as unknown[];
  if (items.length > limit || items.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit))) throw new Error('El catálogo cambió durante la carga; intentá nuevamente.');
  return { response, items, total };
}
export async function catalogRequest(baseUrl: string, path: string, options: RequestInit = {}, fetcher: Fetcher = fetch, timeoutMs = 10_000): Promise<unknown> {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, typeof window === 'undefined' ? undefined : window.location.origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('URL de catálogo inválida');
  let response: Response;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try { response = await fetcher(new URL(path, base), { ...options, cache: 'no-store', signal }); }
  catch (error) { if ((error as Error).name === 'AbortError') throw error; throw new Error('La API del catálogo no está disponible.', { cause: error }); }
  if (!response.ok) throw new CatalogHttpError(response.status);
  try { return await response.json(); } catch { throw new Error('La API devolvió JSON inválido.'); }
}
export async function fetchCatalogPage(base: string, query: CatalogQuery, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<CatalogPage> {
  const limit = 24, params = catalogQueryParams(query);
  params.set('page', String(query.page)); params.set('limit', String(limit));
  const result = pageMeta(await catalogRequest(base, `catalog/products?${params}`, { signal }, fetcher), query.page, limit, 'items');
  const items = result.items.map(value => {
    const raw = object(value, 'producto');
    const variant = raw.matchedVariant === null ? null : parseVariant(raw.matchedVariant);
    return { ...productBase(raw), category: parseLookup(raw.category) as Lookup | null, priceRange: parseRange(raw.priceRange), primaryImage: parseCatalogImage(raw.primaryImage), variants: variant ? [variant] : [] };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Productos duplicados en el catálogo.');
  return { items, page: query.page, limit, total: result.total };
}
export async function fetchFacets(base: string, currency: string, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<Facets> {
  const p = new URLSearchParams(); if (currency) p.set('currency', currency);
  const raw = object(await catalogRequest(base, `catalog/facets?${p}`, { signal }, fetcher), 'filtros');
  const list = (key: string, color = false) => {
    if (!Array.isArray(raw[key]) || (raw[key] as unknown[]).length > 200) throw new Error('Respuesta inválida de filtros');
    const items = (raw[key] as unknown[]).map(item => parseLookup(item, color));
    if (items.some(item => !item) || new Set(items.map(item => item!.slug)).size !== items.length) throw new Error('Respuesta inválida de filtros');
    return items as Lookup[];
  };
  if (!Array.isArray(raw.currencies)) throw new Error('Respuesta inválida de monedas');
  const currencies = raw.currencies.map(currencyCode);
  const tr = object(raw.truncated, 'límites de filtros');
  if (typeof tr.categories !== 'boolean' || typeof tr.materials !== 'boolean' || typeof tr.colors !== 'boolean') throw new Error('Respuesta inválida de filtros');
  const range = parseRange(raw.priceRange);
  if (range && range.currency !== currency) throw new Error('Respuesta inválida de moneda de precios');
  return { categories: list('categories'), materials: list('materials'), colors: list('colors', true) as ColorLookup[], currencies, priceRange: range, truncated: { categories: tr.categories, materials: tr.materials, colors: tr.colors } };
}
export async function fetchProductDetail(base: string, slug: string, page = 1, signal?: AbortSignal, fetcher: Fetcher = fetch) {
  const limit = 100, params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return parseProductDetailResponse(await catalogRequest(base, `catalog/products/${encodeURIComponent(slug)}?${params}`, { signal }, fetcher), page, limit);
}
/** Network responses and SSR bootstrap data share one bounded validation contract. */
export function parseProductDetailResponse(value: unknown, page = 1, limit = 100) {
  const result = pageMeta(value, page, limit, 'variants');
  const dimensions: Record<string, number | null> = {};
  for (const key of ['productWidthMm', 'productHeightMm', 'productLengthMm']) {
    const value = result.response[key];
    if (value !== null && (!Number.isSafeInteger(value) || (value as number) <= 0)) throw new Error('Dimensión de producto inválida');
    dimensions[key] = value as number | null;
  }
  const variants = result.items.map(parseVariant);
  if (new Set(variants.map(v => v.id)).size !== variants.length) throw new Error('Variantes duplicadas en el catálogo.');
  return { product: { ...productBase(result.response), productWidthMm: dimensions.productWidthMm, productHeightMm: dimensions.productHeightMm, productLengthMm: dimensions.productLengthMm, category: parseLookup(result.response.category) as Lookup | null, images: parseImages(result.response.images), variants }, page, total: result.total, limit };
}
/** Landing loads one summary page; opening a card fetches detail on demand. No demo fallback. */
export async function loadApiCatalog(base: string, fetcher: Fetcher = fetch): Promise<StorefrontData> {
  const settings = object(await catalogRequest(base, 'catalog/settings', {}, fetcher), 'ajustes');
  const query: CatalogQuery = { search: '', category: [], material: [], color: [], currency: '', minPriceMinor: '', maxPriceMinor: '', sort: 'name_asc', page: 1 };
  const listing = await fetchCatalogPage(base, query, undefined, fetcher);
  return { brand: text(settings.name, 'marca').trim(), products: listing.items.slice(0, 3), mode: 'api' };
}
export async function loadApiBrand(base: string, fetcher: Fetcher = fetch): Promise<string> {
  const settings = object(await catalogRequest(base, 'catalog/settings', {}, fetcher), 'ajustes');
  return text(settings.name, 'marca').trim();
}

export function parseBulkWarning(item: Record<string, unknown>) {
  if (item.bulkWarningThreshold == null && item.bulkWarningMessage == null) return {};
  if (!Number.isSafeInteger(item.bulkWarningThreshold) || Number(item.bulkWarningThreshold) < 1 || Number(item.bulkWarningThreshold) > 1000 || typeof item.bulkWarningMessage !== 'string' || !item.bulkWarningMessage.trim() || item.bulkWarningMessage.length > 300) throw new Error('Aviso de producto inválido');
  return { bulkWarningThreshold: Number(item.bulkWarningThreshold), bulkWarningMessage: item.bulkWarningMessage };
}
