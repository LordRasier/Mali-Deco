import type { Product, Variant } from '../catalog/storefront-types';
export function variantLimit(variant: Variant | null): number {
  if (!variant) return 0;
  if (variant.supplyMode !== 'stock') return 999;
  return Number.isSafeInteger(variant.stockQuantity) && variant.stockQuantity! >= 0 && variant.stockQuantity! <= 1000000 ? Math.min(999, variant.stockQuantity!) : 0;
}
export function bulkWarnings(items: { productId: string; quantity: number; product: Product | null }[]) {
  const totals = new Map<string, { product: Product; quantity: number }>();
  for (const item of items) if (item.product) {
    const previous = totals.get(item.productId);
    totals.set(item.productId, { product: item.product, quantity: (previous?.quantity ?? 0) + item.quantity });
  }
  return [...totals.values()].filter(({ product, quantity }) => Number.isSafeInteger(product.bulkWarningThreshold) && product.bulkWarningThreshold! >= 1 && quantity >= product.bulkWarningThreshold! && !!product.bulkWarningMessage?.trim())
    .map(({ product }) => ({ id: product.id, text: `${product.name}: ${product.bulkWarningMessage}` }));
}
