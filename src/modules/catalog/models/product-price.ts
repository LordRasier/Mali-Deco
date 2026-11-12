import { assertMinorUnits } from './price';
import { discountPercentage } from '../../../shared/product-discount';

function minor(value: string | number): number {
  if (typeof value === 'string' && !/^\d+$/.test(value)) throw new RangeError('Invalid stored price');
  const amount = Number(value); assertMinorUnits(amount); return amount;
}

/** Public priceMinor is always payable; regular-price metadata exists only for an active discount. */
export function productPrice(regular: string | number, sale?: string | number | null): {
  priceMinor: number; regularPriceMinor?: number; discountPercent?: string;
} {
  const regularPriceMinor = minor(regular), salePriceMinor = sale == null ? null : minor(sale);
  if (salePriceMinor === null || salePriceMinor >= regularPriceMinor) return { priceMinor: regularPriceMinor };
  return { priceMinor: salePriceMinor, regularPriceMinor, discountPercent: discountPercentage(regularPriceMinor, salePriceMinor) };
}
