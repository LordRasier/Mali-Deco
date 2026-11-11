import type { Product } from './storefront-types';

export type SharedProduct = Pick<Product, 'id' | 'slug' | 'name' | 'description' | 'images'>;
export const productAnchor = (id: string) => `producto-${id}`;
export function productSharePath(id: string): string {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? `/catalogo?articulo=${encodeURIComponent(id)}#${productAnchor(id)}` : '';
}
