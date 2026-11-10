import { demoCatalog } from './demo-catalog';
import type { CatalogQuery } from './catalog-query';
import type { CatalogPage, Facets, Product, Variant } from './storefront-types';

export function demoFacets(currency: string): Facets {
  const products = demoCatalog.products;
  const categories = products.flatMap(p => p.category ? [p.category] : []);
  const variants = products.flatMap(p => p.variants);
  const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()];
  const prices = variants.filter(v => v.currency === currency).map(v => v.priceMinor);
  return { categories, materials: unique(variants.flatMap(v => v.material ? [v.material] : [])), colors: unique(variants.flatMap(v => v.colorInfo ? [v.colorInfo] : [])), currencies: ['ARS'], priceRange: prices.length ? { currency, minMinor: Math.min(...prices), maxMinor: Math.max(...prices) } : null, truncated: { categories: false, materials: false, colors: false } };
}
export function demoListing(q: CatalogQuery, limit = 24): CatalogPage {
  const matches = (v: Variant) => (!q.currency || v.currency === q.currency) && (!q.material.length || !!v.material && q.material.includes(v.material.slug)) && (!q.color.length || !!v.colorInfo && q.color.includes(v.colorInfo.slug)) && (!q.minPriceMinor || v.priceMinor >= Number(q.minPriceMinor)) && (!q.maxPriceMinor || v.priceMinor <= Number(q.maxPriceMinor));
  const items = demoCatalog.products.flatMap(product => {
    if (q.search && !product.name.toLocaleLowerCase('es').includes(q.search.toLocaleLowerCase('es'))) return [];
    if (q.category.length && (!product.category || !q.category.includes(product.category.slug))) return [];
    const variants = product.variants.filter(matches).sort((a,b) => a.priceMinor - b.priceMinor || a.id.localeCompare(b.id));
    if (!variants.length) return [];
    const prices = variants.map(v => v.priceMinor);
    return [{ ...product, variants: [variants[0]], priceRange: q.currency ? { currency: q.currency, minMinor: Math.min(...prices), maxMinor: Math.max(...prices) } : null } as Product];
  });
  items.sort((a,b) => {
    const name = a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
    if (q.sort === 'name_desc') return -a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
    if (q.sort === 'price_asc' || q.sort === 'price_desc') return (a.variants[0].priceMinor - b.variants[0].priceMinor) * (q.sort === 'price_asc' ? 1 : -1) || name;
    return name;
  });
  return { items: items.slice((q.page - 1) * limit, q.page * limit), page: q.page, limit, total: items.length };
}
