import type { CartLine, Product } from './storefront-types';

export function addToCart(lines: CartLine[], productId: string, variantId: string): CartLine[] {
  const existing = lines.find(line => line.productId === productId && line.variantId === variantId);
  if (existing) return lines.map(line => line === existing ? { ...line, quantity: line.quantity + 1 } : line);
  return [...lines, { productId, variantId, quantity: 1 }];
}
export function changeQuantity(lines: CartLine[], productId: string, variantId: string, quantity: number): CartLine[] {
  return quantity <= 0 ? lines.filter(line => !(line.productId === productId && line.variantId === variantId)) : lines.map(line => line.productId === productId && line.variantId === variantId ? { ...line, quantity } : line);
}
export function resolveCart(lines: CartLine[], products: Product[]) {
  return lines.flatMap(line => {
    const product = products.find(item => item.id === line.productId);
    const variant = product?.variants.find(item => item.id === line.variantId);
    return product && variant ? [{ ...line, product, variant }] : [];
  });
}
/** Preserve exact minor units, including cart subtotals larger than Number.MAX_SAFE_INTEGER. */
export function formatPrice(priceMinor: number | bigint, currency: string): string {
  const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const value = BigInt(priceMinor);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(digits, '0');
  return formatter.formatToParts(whole).map(part => part.type === 'fraction' ? fraction : part.value).join('');
}

/** Sanitize storage without assuming the current listing is a complete catalog. */
export function reconcileCart(value: unknown): { lines: CartLine[]; removed: number } {
  if (!Array.isArray(value)) return { lines: [], removed: 0 };
  const byProduct = new Map<string, Map<string, CartLine>>();
  const lines: CartLine[] = [];
  let removed = 0;
  for (const item of value) {
    if (!item || typeof item.productId !== 'string' || typeof item.variantId !== 'string' ||
      !/^[-\x21-\x7e]{1,36}$/.test(item.productId) || !/^[-\x21-\x7e]{1,36}$/.test(item.variantId) ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      removed++;
      continue;
    }
    const variants = byProduct.get(item.productId) ?? new Map<string, CartLine>();
    const existing = variants.get(item.variantId);
    if (existing) {
      existing.quantity = Math.min(999, existing.quantity + item.quantity);
    } else if (lines.length < 1000) {
      const line = { productId: item.productId, variantId: item.variantId, quantity: item.quantity };
      lines.push(line);
      variants.set(item.variantId, line);
      byProduct.set(item.productId, variants);
    } else {
      removed++;
    }
  }
  return { lines, removed };
}
