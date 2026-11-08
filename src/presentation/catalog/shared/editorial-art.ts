import type { Product } from './storefront-types';

export function catalogImageUrl(id: string, width: 320 | 800 | 1600) {
  return `/api/v1/catalog/images/${id}?w=${width}`;
}

/** The illustration is enabled only for one explicitly identified local fixture. */
export function fixtureImageId(env: { NODE_ENV?: string; DEV_FIXTURE_PRODUCT_ID?: string }): string | undefined {
  const id = env.DEV_FIXTURE_PRODUCT_ID;
  return env.NODE_ENV === 'development' && id && id.trim() === id && id.length <= 128 ? id : undefined;
}

export function productPresentation(product: Product, mode: 'demo' | 'api', fixtureId?: string) {
  const real = product.primaryImage ?? product.images?.[0];
  if (real) return { image: catalogImageUrl(real.id, 320), illustration: false };
  if (mode === 'demo' && product.image) return { image: product.image, illustration: mode === 'demo' };
  if (mode === 'api' && fixtureId && product.id === fixtureId) {
    return { image: '/storefront/florero-ondas.webp', illustration: true };
  }
  return { image: undefined, illustration: false };
}
