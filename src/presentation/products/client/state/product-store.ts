import { fetchProductDetail } from '../../../shared/catalog/api-catalog';
import { parseVariantQuery, resolveRequestedVariant } from '../../../shared/products/product-selection';
import type { Product, Variant } from '../../../shared/catalog/storefront-types';
import { browserProductRuntime, type ProductRuntime } from './product-runtime';

export type ProductSnapshot = {
  variants: Variant[];
  selected: Variant | null;
  status: 'loading' | 'ready' | 'error';
  warning: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  pageError: boolean;
  pageConflict: boolean;
};
type Options = { runtime?: ProductRuntime; resolve?: typeof resolveRequestedVariant; fetchPage?: typeof fetchProductDetail };

/** One renderer-neutral owner per product view; start returns lifecycle-scoped cleanup. */
export function createProductStore(initial: Product, total: number, mode: 'demo' | 'api', options: Options = {}) {
  const runtime = options.runtime ?? browserProductRuntime, resolve = options.resolve ?? resolveRequestedVariant;
  const fetchPage = options.fetchPage ?? fetchProductDetail;
  const listeners = new Set<() => void>();
  let active = false, generation = 0, revision = 0, page = 1;
  let request: AbortController | undefined, moreRequest: AbortController | undefined;
  const serverSnapshot: ProductSnapshot = {
    variants: [...initial.variants], selected: null, status: 'loading', warning: null,
    hasMore: mode === 'api' && total > 100, loadingMore: false, pageError: false, pageConflict: false,
  };
  let snapshot = serverSnapshot;
  const publish = (patch: Partial<ProductSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  function refresh(id?: string) {
    if (!active) return;
    const lifecycle = generation, identity = ++revision;
    request?.abort(); moreRequest?.abort();
    const controller = new AbortController(); request = controller;
    const current = () => active && generation === lifecycle && revision === identity && !controller.signal.aborted;
    publish({ selected: null, warning: null, status: 'loading', loadingMore: false });
    // A synchronous subscriber may stop/restart or change selection during publication.
    if (!current()) return;
    void (async () => {
      try {
        if (id !== undefined) runtime.choose(id);
        const query = parseVariantQuery(new URLSearchParams(runtime.search()));
        if (!current()) return;
        const result = await resolve(initial.id, snapshot.variants, query, mode, controller.signal);
        if (current()) publish({ selected: result.variant, warning: result.warning, status: 'ready' });
      } catch {
        if (current()) publish({ selected: null, status: 'error' });
      }
    })();
  }

  async function loadMore() {
    if (!active || snapshot.loadingMore || !snapshot.hasMore) return;
    const lifecycle = generation, identity = revision, nextPage = page + 1;
    const controller = new AbortController(); moreRequest = controller;
    const current = () => active && generation === lifecycle && revision === identity
      && moreRequest === controller && !controller.signal.aborted;
    publish({ loadingMore: true, pageError: false, pageConflict: false });
    if (!current()) return;
    try {
      const response = await fetchPage('/api/v1/', initial.slug, nextPage, controller.signal);
      if (!current()) return;
      if (response.product.id !== initial.id || response.product.slug !== initial.slug || response.total !== total
        || response.page !== nextPage || response.limit !== 100
        || response.product.variants.length !== Math.max(0, Math.min(100, total - (nextPage - 1) * 100))) {
        throw new Error('Product page changed');
      }
      // Off-page resolution is intentionally not part of the paginated membership set.
      const combined = new Map(snapshot.variants.map(item => [item.id, item]));
      for (const item of response.product.variants) {
        if (combined.has(item.id)) {
          publish({ loadingMore: false, pageError: true, pageConflict: true }); return;
        }
        combined.set(item.id, item);
      }
      page = nextPage;
      publish({ variants: [...combined.values()], hasMore: page * 100 < total, loadingMore: false,
        selected: snapshot.selected ? combined.get(snapshot.selected.id) ?? snapshot.selected : null });
    } catch {
      if (current()) publish({ loadingMore: false, pageError: true });
    }
  }

  function start() {
    if (active) throw new Error('Product store already started');
    active = true;
    const lifecycle = ++generation;
    const unlisten = runtime.listen(() => { if (active && lifecycle === generation) refresh(); });
    refresh();
    return () => {
      if (!active || lifecycle !== generation) return;
      active = false; generation++; request?.abort(); moreRequest?.abort(); unlisten();
    };
  }

  return {
    start, getSnapshot: () => snapshot, getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    choose: (id: string) => refresh(id), retry: () => refresh(),
    loadMore,
  };
}
