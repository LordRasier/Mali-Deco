import { pairKey, type ResolvedPair } from '../../../shared/cart/cart-resolution';
import type { CartLine } from '../../../shared/catalog/storefront-types';
import { variantLimit, bulkWarnings } from '../../../shared/cart/inventory';

export type CartStatus = 'idle' | 'loading' | 'error';
export type CartFlags = {
  ready: boolean; status: CartStatus; removedNotice: number;
  storageUnavailable: boolean; storageTabOnly: boolean;
  mutationError?: string;
  mutating?: boolean;
};

/** Keep prices authoritative and exact; a cached price never hides a failed refresh. */
export function cartSnapshot(lines: CartLine[], values: Map<string, ResolvedPair>, flags: CartFlags) {
  const items = lines.map(line => ({ ...line, ...(values.get(pairKey(line)) ?? { product: null, variant: null }) }));
  const totals = items.reduce<Record<string, bigint>>((sums, item) => {
    if (item.variant) sums[item.variant.currency] = (sums[item.variant.currency] ?? 0n) + BigInt(item.quantity) * BigInt(item.variant.priceMinor);
    return sums;
  }, {});
  return {
    ...flags, items, totals, count: lines.reduce((sum, line) => sum + line.quantity, 0),
    stockShortage: items.some(item => item.variant?.supplyMode === 'stock' && item.quantity > variantLimit(item.variant)),
    bulkWarnings: bulkWarnings(items),
    unresolved: !!flags.mutating || items.some(item => !item.product || !item.variant || (item.variant.supplyMode === 'stock' && item.quantity > variantLimit(item.variant))) || flags.status !== 'idle',
  };
}

export type CartView = ReturnType<typeof cartSnapshot>;
