import { catalogColor } from './catalog-color';
import type { Product } from './storefront-types';

/** A filtered listing is only a sample unless its explicit total proves otherwise. */
export function cardOptions(product: Pick<Product, 'variants' | 'variantCount'>) {
  const options = product.variants;
  const complete = product.variantCount === options.length;
  const colors = options.map(option => ({ hex: catalogColor(option.colorInfo?.hex), name: option.colorInfo?.name.trim().toLocaleLowerCase('es') }));
  const uniqueColors = colors.every(color => color.hex && color.name)
    && new Set(colors.map(color => color.hex.toLowerCase())).size === options.length
    && new Set(colors.map(color => color.name)).size === options.length;
  const kind = !complete ? 'more' : options.length === 0 ? 'none' : options.length === 1 ? 'single'
    : uniqueColors ? 'colors' : options.length <= 3 ? 'buttons' : 'select';
  return { kind, options, selected: complete ? options[0] : undefined,
    visible: kind === 'colors' ? options.slice(0, 6) : options, hasMore: kind === 'more' || (kind === 'colors' && options.length > 6) };
}
