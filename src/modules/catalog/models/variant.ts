import type { ProductVariant } from './catalog.types';
import { assertMinorUnits } from './price';

export function validateVariant(variant: Pick<ProductVariant, 'sku' | 'name' | 'priceMinor' | 'currency'> & { salePriceMinor?: number | null }): void {
  for (const value of [variant.sku, variant.name]) {
    if (!value.trim() || value.length > 255) throw new RangeError('Variant fields must contain 1–255 characters');
  }
  validateVariantPrice(variant);
}

export function validateVariantPrice(variant: Pick<ProductVariant, 'priceMinor' | 'currency'> & { salePriceMinor?: number | null }): void {
  assertMinorUnits(variant.priceMinor);
  if (variant.salePriceMinor != null) assertMinorUnits(variant.salePriceMinor);
  if (typeof variant.currency !== 'string' || variant.currency.length !== 3 || !/^[A-Z]{3}$/.test(variant.currency)) {
    throw new RangeError('Currency must be a three-letter uppercase code');
  }
}
