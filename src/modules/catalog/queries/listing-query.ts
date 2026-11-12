import { BadRequestException } from '@nestjs/common';
import { parseCatalogQuery } from '../validation/catalog-validation';

export type ListingSort = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
export interface ListingQuery {
  page: number; limit: number; search?: string;
  featured?: boolean;
  category: string[]; material: string[]; color: string[]; currency?: string;
  minPriceMinor?: number; maxPriceMinor?: number; sort: ListingSort;
}

/** Parse once at the HTTP boundary; SQL receives only validated values and placeholders. */
export function parseListingQuery(query: Record<string, unknown>): ListingQuery {
  const allowed = ['page', 'limit', 'search', 'category', 'material', 'color', 'currency', 'minPriceMinor', 'maxPriceMinor', 'sort', 'featured'];
  if (Object.keys(query).some(key => !allowed.includes(key))) throw new BadRequestException('Unknown catalog filter');
  const base = parseCatalogQuery(query);
  if (query.featured !== undefined && query.featured !== 'true') throw new BadRequestException('Invalid featured filter');
  const slugs = (value: unknown): string[] => {
    if (value === undefined) return [];
    if (typeof value !== 'string' || value.length > 1619) throw new BadRequestException('Invalid catalog filter');
    const parts = value.split(',');
    if (parts.length > 20 || parts.some(part => part.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))) throw new BadRequestException('Invalid catalog filter');
    return [...new Set(parts)];
  };
  const minor = (value: unknown): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new BadRequestException('Invalid price bound');
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new BadRequestException('Invalid price bound');
    return n;
  };
  const currency = query.currency;
  if (currency !== undefined && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))) throw new BadRequestException('Invalid currency');
  const sort = query.sort === undefined ? 'name_asc' : query.sort;
  if (typeof sort !== 'string' || !['name_asc', 'name_desc', 'price_asc', 'price_desc'].includes(sort)) throw new BadRequestException('Invalid sort');
  const minPriceMinor = minor(query.minPriceMinor);
  const maxPriceMinor = minor(query.maxPriceMinor);
  if (minPriceMinor !== undefined && maxPriceMinor !== undefined && minPriceMinor > maxPriceMinor) throw new BadRequestException('Invalid price range');
  if (!currency && (minPriceMinor !== undefined || maxPriceMinor !== undefined || sort.startsWith('price_'))) throw new BadRequestException('Currency required for price filters and sorting');
  return { ...base, ...(query.featured === 'true' ? { featured: true } : {}), category: slugs(query.category), material: slugs(query.material), color: slugs(query.color), currency: currency as string | undefined, minPriceMinor, maxPriceMinor, sort: sort as ListingSort };
}
