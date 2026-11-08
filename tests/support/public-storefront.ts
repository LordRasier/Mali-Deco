import { NotFoundException } from '@nestjs/common';

/** Explicit test providers, never selected by application environment or shipped in dist. */
const variant = { id: 'arena', name: 'Test variant', priceMinor: 1000, currency: 'ARS', supplyMode: 'stock', material: null, color: null };
const product = { id: 'fixture-product', slug: 'florero-ondas', name: 'Florero Ondas', description: 'Synthetic test fixture', category: null };
export const publicCatalogFixture = {
  settings: async () => ({ name: 'Test store' }),
  list: async () => ({ items: [{ ...product, primaryImage: null, priceRange: null, matchedVariant: variant }], page: 1, limit: 24, total: 1 }),
  detail: async (slug: string) => {
    if (slug !== product.slug) throw new NotFoundException();
    return { ...product, productWidthMm: 100, productHeightMm: 200, productLengthMm: 100,
      images: [], variants: [variant], page: 1, limit: 100, total: 1 };
  },
};
export const publicFacetsFixture = { get: async () => ({ categories: [], materials: [], colors: [], currencies: ['ARS'], priceRange: null,
  truncated: { categories: false, materials: false, colors: false } }) };
