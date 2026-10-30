export type Variant = {
  id: string;
  name: string;
  color?: string;
  priceMinor: number;
  currency: string;
  supplyMode?: 'stock' | 'made_to_order';
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  image?: string;
  variants: Variant[];
};
export type StorefrontData = {
  brand: string;
  heroImage?: string;
  products: Product[];
  mode: 'demo' | 'api';
};
export type CartLine = { productId: string; variantId: string; quantity: number };
