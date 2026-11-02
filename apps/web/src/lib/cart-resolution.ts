import { catalogRequest, parseVariant } from './api-catalog';
import { demoCatalog } from './demo-catalog';
import type { CartLine, Product, Variant } from './storefront-types';

export type CartPair = Pick<CartLine, 'productId' | 'variantId'>;
export type ResolvedPair = CartPair & { product: Product; variant: Variant };
export type CartResolution = { resolved: ResolvedPair[]; missing: CartPair[] };
export const pairKey = (pair: CartPair) => JSON.stringify([pair.productId, pair.variantId]);

/** A response belongs only to the same mode and cart identity revision that requested it. */
export function acceptsCartResolution(request: { key: string; revision: number }, current: { key: string; revision: number; aborted: boolean }): boolean {
  return !current.aborted && request.key === current.key && request.revision === current.revision;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resolución de carrito inválida');
  return value as Record<string, unknown>;
}
function parsePair(value: unknown): CartPair {
  const item = record(value);
  if (typeof item.productId !== 'string' || typeof item.variantId !== 'string') throw new Error('Resolución de carrito inválida');
  return { productId: item.productId, variantId: item.variantId };
}
function parseResolution(value: unknown, requested: CartPair[]): CartResolution {
  const data = record(value);
  if (!Array.isArray(data.resolved) || !Array.isArray(data.missing)) throw new Error('Resolución de carrito incompleta');
  const expected = new Set(requested.map(pairKey));
  const seen = new Set<string>();
  const check = (pair: CartPair) => {
    const key = pairKey(pair);
    if (!expected.has(key) || seen.has(key)) throw new Error('Resolución de carrito incompleta');
    seen.add(key);
  };
  const resolved = data.resolved.map(value => {
    const item = record(value), pair = parsePair(item), rawProduct = record(item.product);
    check(pair);
    const variant = parseVariant(item.variant);
    if (rawProduct.id !== pair.productId || variant.id !== pair.variantId || typeof rawProduct.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawProduct.slug) || typeof rawProduct.name !== 'string' || !rawProduct.name.trim() || typeof rawProduct.description !== 'string') throw new Error('Resolución de carrito inválida');
    const product: Product = { id: pair.productId, slug: rawProduct.slug, name: rawProduct.name, description: rawProduct.description, variants: [variant] };
    return { ...pair, product, variant };
  });
  const missing = data.missing.map(value => { const pair = parsePair(value); check(pair); return pair; });
  if (seen.size !== expected.size) throw new Error('Resolución de carrito incompleta');
  return { resolved, missing };
}
/** Complete exact partition across all batches or reject; never prune after a partial failure. */
export async function resolveCartPairs(lines: CartPair[], mode: 'demo' | 'api', signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<CartResolution> {
  const pairs = [...new Map(lines.map(line => [pairKey(line), { productId: line.productId, variantId: line.variantId }])).values()];
  if (mode === 'demo') {
    const resolved: ResolvedPair[] = [], missing: CartPair[] = [];
    for (const pair of pairs) {
      const product = demoCatalog.products.find(p => p.id === pair.productId);
      const variant = product?.variants.find(v => v.id === pair.variantId);
      if (product && variant) resolved.push({ ...pair, product, variant }); else missing.push(pair);
    }
    return { resolved, missing };
  }
  const batches: CartPair[][] = [];
  for (let i = 0; i < pairs.length; i += 100) batches.push(pairs.slice(i, i + 100));
  const results: CartResolution[] = [];
  for (let i = 0; i < batches.length; i += 4) {
    const group = await Promise.all(batches.slice(i, i + 4).map(async batch => {
      const response = await catalogRequest('/api/v1/', 'catalog/cart/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: batch }), signal }, fetcher);
      return parseResolution(response, batch);
    }));
    results.push(...group);
  }
  return { resolved: results.flatMap(r => r.resolved), missing: results.flatMap(r => r.missing) };
}
