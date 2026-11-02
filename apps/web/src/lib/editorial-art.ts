import type { Product } from './storefront-types';

/** The illustration is enabled only for one explicitly identified local fixture. */
export function fixtureImageId(env: { NODE_ENV?: string; DEV_FIXTURE_PRODUCT_ID?: string }): string | undefined {
  const id = env.DEV_FIXTURE_PRODUCT_ID;
  return env.NODE_ENV === 'development' && id && id.trim() === id && id.length <= 128 ? id : undefined;
}

export function productPresentation(product: Product, mode: 'demo' | 'api', fixtureId?: string) {
  if (product.image) return { image: product.image, illustration: mode === 'demo' };
  if (mode === 'api' && fixtureId && product.id === fixtureId) {
    return { image: '/storefront/florero-ondas.webp', illustration: true };
  }
  return { image: undefined, illustration: false };
}
