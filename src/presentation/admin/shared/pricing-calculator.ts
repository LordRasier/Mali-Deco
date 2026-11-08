import { decimalToMinor, minorToDecimal } from '../../catalog/shared/money';

export type PricingValues = { cost: string; markup: string; sale: string };
export type PricingField = keyof PricingValues;
const round = (n: bigint, d: bigint) => n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d;
const percentText = (basis: bigint) => `${basis < 0n ? '-' : ''}${(basis < 0n ? -basis : basis) / 100n},${String((basis < 0n ? -basis : basis) % 100n).padStart(2, '0')}`;
export function markupBasis(value: string): bigint | undefined {
  const text = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return;
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const number = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n);
  return number >= -10000n && number <= 10000000n ? number : undefined;
}
function amount(value: string, currency: string): bigint | undefined {
  if (!value.trim()) return;
  try { return BigInt(decimalToMinor(value, currency)); } catch { return; }
}
export function markupFromAmounts(cost: string | null | undefined, price: string): string {
  if (cost == null || !/^\d+$/.test(cost) || !/^\d+$/.test(price) || BigInt(cost) === 0n) return '';
  return percentText(round((BigInt(price) - BigInt(cost)) * 10000n, BigInt(cost)));
}

/** The edited value is never overwritten. Empty/partial fields are not zero. */
export function calculatePricing(values: PricingValues, changed: PricingField, currency: string): Partial<PricingValues> {
  if (!values[changed].trim()) return {};
  const cost = amount(values.cost, currency), sale = amount(values.sale, currency), markup = markupBasis(values.markup);
  const money = (value: bigint) => value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? minorToDecimal(String(value), currency).replace('.', ',') : undefined;
  const result = (key: 'cost' | 'sale', value: bigint): Partial<PricingValues> => { const text = money(value); return text === undefined ? {} : { [key]: text }; };
  if (changed === 'cost' && cost !== undefined) {
    if (markup !== undefined) return result('sale', round(cost * (10000n + markup), 10000n));
    if (sale !== undefined) return { markup: cost === 0n ? '' : markupFromAmounts(String(cost), String(sale)) };
  }
  if (changed === 'markup' && markup !== undefined) {
    if (cost !== undefined) return result('sale', round(cost * (10000n + markup), 10000n));
    if (sale !== undefined && markup > -10000n) return result('cost', round(sale * 10000n, 10000n + markup));
  }
  if (changed === 'sale' && sale !== undefined) {
    if (cost !== undefined) return { markup: cost === 0n ? '' : markupFromAmounts(String(cost), String(sale)) };
    if (markup !== undefined && markup > -10000n) return result('cost', round(sale * 10000n, 10000n + markup));
  }
  return {};
}
