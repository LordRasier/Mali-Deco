import { resolveCartPairs } from '../cart/cart-resolution';
import type { Variant } from '../catalog/storefront-types';

export type VariantQuery = { kind: 'none' } | { kind: 'invalid' } | { kind: 'id'; id: string };
export function parseVariantQuery(params: URLSearchParams): VariantQuery {
  const values = params.getAll('variant');
  if (!values.length) return { kind: 'none' };
  if (values.length !== 1 || !/^[-\x21-\x7e]{1,36}$/.test(values[0])) return { kind: 'invalid' };
  return { kind: 'id', id: values[0] };
}

/** Resolve a requested off-page ID through the authoritative pair resolver. */
export async function resolveRequestedVariant(
  productId: string, variants: Variant[], query: VariantQuery, mode: 'demo' | 'api',
  signal?: AbortSignal, resolver: typeof resolveCartPairs = resolveCartPairs,
): Promise<{ variant: Variant | null; warning: string | null }> {
  if (query.kind === 'none') return { variant: variants[0] ?? null, warning: null };
  if (query.kind === 'invalid') return { variant: null, warning: 'El enlace de variante es inválido. Elegí una variante.' };
  const found = variants.find(variant => variant.id === query.id);
  if (found) return { variant: found, warning: null };
  const result = await resolver([{ productId, variantId: query.id }], mode, signal);
  if (result.missing.length || !result.resolved[0]) return { variant: null, warning: 'La variante del enlace no está disponible. Elegí otra variante.' };
  return { variant: result.resolved[0].variant, warning: null };
}
