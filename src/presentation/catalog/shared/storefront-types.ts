export type Lookup = { id: string; slug: string; name: string; sortOrder?: number };
export type ColorLookup = Lookup & { hex: string | null };
export type PriceRange = { currency: string; minMinor: number; maxMinor: number };
export type Variant = {
  id: string; name: string; color?: string; priceMinor: number; currency: string;
  supplyMode?: 'stock' | 'made_to_order'; material?: Lookup | null; colorInfo?: ColorLookup | null;
  stockQuantity?: number;
  options?: { name: string; value: string }[];
};
export type CatalogImage = { id: string; alt: string; width: number; height: number };
export type Product = {
  id: string; slug: string; name: string; description: string; image?: string; variants: Variant[];
  category?: Lookup | null; priceRange?: PriceRange | null; primaryImage?: CatalogImage | null; images?: CatalogImage[];
  variantCount?: number;
  bulkWarningThreshold?: number | null; bulkWarningMessage?: string | null;
  productWidthMm?: number | null; productHeightMm?: number | null; productLengthMm?: number | null;
};
export type StorefrontData = { brand: string; heroImage?: string; products: Product[]; mode: 'demo' | 'api' };
export type CartLine = { productId: string; variantId: string; quantity: number };
export type Facets = { categories: Lookup[]; materials: Lookup[]; colors: ColorLookup[]; currencies: string[]; priceRange: PriceRange | null; truncated: { categories: boolean; materials: boolean; colors: boolean } };
export type CatalogPage = { items: Product[]; page: number; limit: number; total: number };
