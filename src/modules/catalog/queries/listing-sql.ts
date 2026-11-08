import { ListingQuery } from './listing-query';

/** Every condition on the variant is applied to one row, never to separate EXISTS clauses. */
export function variantPredicate(query: ListingQuery): { sql: string; params: (string | number)[] } {
  const clauses = ['v.archived_at IS NULL'];
  const params: (string | number)[] = [];
  const inSlugs = (column: string, values: string[]) => {
    if (values.length) { clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`); params.push(...values); }
  };
  inSlugs('m.slug', query.material);
  inSlugs('co.slug', query.color);
  if (query.currency) { clauses.push('v.currency = ?'); params.push(query.currency); }
  if (query.minPriceMinor !== undefined) { clauses.push('v.price_minor >= ?'); params.push(query.minPriceMinor); }
  if (query.maxPriceMinor !== undefined) { clauses.push('v.price_minor <= ?'); params.push(query.maxPriceMinor); }
  return { sql: clauses.join(' AND '), params };
}

export function productPredicate(query: ListingQuery): { sql: string; params: (string | number)[] } {
  const clauses = ["p.status = 'active'", 'p.archived_at IS NULL'];
  const params: (string | number)[] = [];
  if (query.search) { clauses.push('LOCATE(?, p.name) > 0'); params.push(query.search); }
  if (query.category.length) { clauses.push(`c.slug IN (${query.category.map(() => '?').join(', ')})`); params.push(...query.category); }
  if (query.material.length || query.color.length || query.currency || query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined || query.sort.startsWith('price_')) {
    clauses.push('matched.product_id IS NOT NULL');
  }
  return { sql: clauses.join(' AND '), params };
}

export function productOrder(sort: ListingQuery['sort']): string {
  switch (sort) {
    case 'name_desc': return 'p.name DESC, p.id ASC';
    case 'price_asc': return 'matched.min_price ASC, p.name ASC, p.id ASC';
    case 'price_desc': return 'matched.min_price DESC, p.name ASC, p.id ASC';
    default: return 'p.name ASC, p.id ASC';
  }
}
