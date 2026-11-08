import { displayPriceToMinor, emptyCatalogQuery, type CatalogQuery } from './catalog-query';

export type FilterGroup = 'category' | 'material' | 'color';

/** Preserve selected values not present in bounded metadata; never silently broaden a query. */
export function toggleCatalogFilter(query: CatalogQuery, group: FilterGroup, value: string): CatalogQuery {
  const selected = query[group];
  if (!selected.includes(value) && selected.length >= 20) return query;
  return { ...query, [group]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value] };
}
export function changeCatalogCurrency(query: CatalogQuery, currency: string): CatalogQuery {
  return { ...query, currency, minPriceMinor: '', maxPriceMinor: '', sort: !currency && query.sort.startsWith('price_') ? 'name_asc' : query.sort };
}
export function applyCatalogPrices(query: CatalogQuery, min: string, max: string): CatalogQuery {
  const minPriceMinor = displayPriceToMinor(min, query.currency), maxPriceMinor = displayPriceToMinor(max, query.currency);
  if (minPriceMinor && maxPriceMinor && BigInt(minPriceMinor) > BigInt(maxPriceMinor)) throw new Error('El mínimo no puede superar el máximo.');
  return { ...query, minPriceMinor, maxPriceMinor, page: 1 };
}
export function clearCatalogFilters(query: CatalogQuery): CatalogQuery {
  return { ...emptyCatalogQuery(), currency: query.currency };
}
