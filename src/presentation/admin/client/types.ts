export type AdminRole = 'owner' | 'catalog' | 'operations';
export interface User { id: string; email: string; role: AdminRole }

export interface Dimensions {
  productWeightG: number | null;
  productWidthMm: number | null;
  productHeightMm: number | null;
  productLengthMm: number | null;
  packageWeightG: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  packageLengthMm: number | null;
}
export interface ProductInput extends Dimensions {
  featured?: boolean;
  name: string;
  slug: string;
  description: string;
  status: 'draft' | 'active';
  /** Omission preserves an existing assignment; null clears it. */
  categoryId?: string | null;
  bulkWarningThreshold?: number | null;
  bulkWarningMessage?: string | null;
}
export interface Product extends ProductInput { id: string; archivedAt: string | null }
export interface VariantInput {
  salePriceMinor?: number | null;
  sku: string;
  name: string;
  priceMinor: number;
  currency: string;
  supplyMode: 'stock' | 'made_to_order';
  materialId?: string | null;
  colorId?: string | null;
  options?: { name: string; value: string }[];
}
export interface Variant extends Omit<VariantInput, 'priceMinor' | 'supplyMode' | 'salePriceMinor'> {
  salePriceMinor?: string | null;
  id: string;
  productId: string;
  priceMinor: string;
  supplyMode: 'stock' | 'made_to_order' | null;
  archivedAt: string | null;
  stockQuantity?: number;
  imageId?: string | null;
}
export interface Page<T> { items: T[]; page: number; limit: number; total: number }
export interface ProductDetail extends Product { variants: Variant[]; page: number; limit: number; total: number }

export type TaxonomyKind = 'categories' | 'materials' | 'colors';
export interface TaxonomyItem { id: string; slug: string; name: string; sortOrder: number; archivedAt: string | null; hex?: string | null }
