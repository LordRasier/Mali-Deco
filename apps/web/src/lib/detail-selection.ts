import { resolveCartPairs } from './cart-resolution';
import type { Product, Variant } from './storefront-types';

/** Verify an off-page matched variant independently before exposing it for purchase. */
export async function initialDetailSelection(summary: Product, variants: Variant[], signal?: AbortSignal, resolver: typeof resolveCartPairs = resolveCartPairs) {
  const preferredId = summary.variants[0]?.id ?? '';
  if (!preferredId || variants.some(variant => variant.id === preferredId)) return { variants, preferredId, warning: null };
  const result = await resolver([{ productId: summary.id, variantId: preferredId }], 'api', signal);
  if (result.missing.length) return { variants, preferredId: '', warning: 'La variante que coincidía con los filtros ya no está disponible. Elegí otra variante.' };
  return { variants: [result.resolved[0].variant, ...variants], preferredId, warning: null };
}
