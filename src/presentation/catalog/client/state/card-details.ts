import { fetchProductDetail } from '../../../shared/catalog/api-catalog';
import type { Product } from '../../shared/storefront-types';

/** One modal owner; each open/close invalidates all previous detail requests. */
export function createCardDetails(fetchPage: typeof fetchProductDetail = fetchProductDetail) {
  let identity: Pick<Product, 'id' | 'slug'> | undefined, product: Product | undefined;
  let page = 0, total = 0, loading = false, error = '', revision = 0;
  let request: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  async function load(next: number) {
    if (!identity || loading) return;
    const expected = identity, version = revision, controller = new AbortController(); request = controller;
    const current = () => revision === version && !controller.signal.aborted;
    loading = true; error = ''; publish();
    try {
      const result = await fetchPage('/api/v1/', expected.slug, next, controller.signal);
      if (!current()) return;
      const variants = [...(next === 1 ? [] : product?.variants ?? []), ...result.product.variants];
      if (result.product.id !== expected.id || result.product.slug !== expected.slug || result.page !== next || result.limit !== 100
        || !Number.isSafeInteger(result.total) || result.total < 0 || (next > 1 && result.total !== total)
        || result.product.variants.length !== Math.max(0, Math.min(100, result.total - (next - 1) * 100))
        || new Set(variants.map(option => option.id)).size !== variants.length) {
        product = undefined; page = 0; total = 0;
        throw new Error('El catálogo cambió durante la carga. Volvé a intentarlo.');
      }
      page = next; total = result.total; product = { ...result.product, variants, variantCount: total };
    } catch (cause) {
      if (current()) error = cause instanceof Error ? cause.message : 'No pudimos cargar el producto.';
    } finally { if (current()) { loading = false; publish(); } }
  }
  const close = () => { revision++; request?.abort(); identity = undefined; product = undefined; page = 0; total = 0; loading = false; error = ''; publish(); };
  return {
    snapshot: () => ({ product, loading, error, hasMore: !!product && product.variants.length < total, total }),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(value: Pick<Product, 'id' | 'slug'>) { close(); identity = value; return load(1); },
    close, more: () => product && product.variants.length < total ? load(page + 1) : Promise.resolve(),
    retry: () => load(page + 1),
  };
}
