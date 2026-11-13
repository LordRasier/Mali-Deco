import { minorToDisplayPrice, type CatalogQuery } from './shared/catalog-query';
import type { Facets } from './shared/storefront-types';
import { catalogColor } from './catalog-color';

/** Project bounded metadata; selected unknown values remain in query state, never silently removed. */
export function catalogFilters(query: CatalogQuery, facets: Facets) {
  const groups = [
    { key: 'category' as const, label: 'Categoría', choices: facets.categories, truncated: facets.truncated.categories },
    { key: 'color' as const, label: 'Color', choices: facets.colors, truncated: facets.truncated.colors },
  ];
  return {
    currency: query.currency, min: minorToDisplayPrice(query.minPriceMinor, query.currency), max: minorToDisplayPrice(query.maxPriceMinor, query.currency),
    currencies: [...(query.currency && !facets.currencies.includes(query.currency) ? [{ value: query.currency, label: `${query.currency} (no disponible)`, selected: true, available: false }] : []),
      ...facets.currencies.map(value => ({ value, label: value, selected: value === query.currency, available: true }))],
    groups: groups.map(group => ({ ...group, expanded: true,
      choices: group.choices.map(choice => ({ value: choice.slug, label: choice.name,
      colorHex: group.key === 'color' && 'hex' in choice ? catalogColor(choice.hex) : '',
      checked: query[group.key].includes(choice.slug), disabled: !query[group.key].includes(choice.slug) && query[group.key].length >= 20 })) })),
    priceDisabled: !query.currency,
  };
}
