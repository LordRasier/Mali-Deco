import { ApiError, type apiRequest } from '../../api';
import { canManageCatalog, type createSessionStore } from '../../session-core';
import type { ProductInput, VariantInput } from '../../types';
type InitialPrice = Pick<VariantInput, 'priceMinor' | 'currency' | 'supplyMode'> & { costMinor?: number | null; stockQuantity?: number };

export type ProductListFilters = { status?: string; sort?: string };
export type AdminProductRoute = ({ view: 'list'; page: number; search: string } & ProductListFilters) | { view: 'create' }
  | { view: 'detail' | 'edit' | 'variant-create'; id: string; page?: number }
  | { view: 'variant-edit'; id: string; variantId: string; page?: number };
export type AdminProductsView = {
  render(html: string, route: AdminProductRoute): void;
  loading(value: boolean): void;
  busy(value: boolean): void;
  error(message: string, retry: boolean): void;
  committed(result: { productId: string; archived: boolean }): void;
  informationSaved?(product: ProductInput): void;
  focus(): void;
};
export type AdminProductsRuntime = {
  read(route: AdminProductRoute, signal: AbortSignal): Promise<string>;
  request: typeof apiRequest;
  confirm(): boolean;
};
export type ProductMutationLease = { current(): boolean; release(): void };
type Session = Pick<ReturnType<typeof createSessionStore>, 'getSnapshot' | 'getEpoch' | 'expire'>;
const unknownOutcome = 'No se pudo confirmar el resultado. La operación podría haberse completado; revise el catálogo antes de reintentar.';
function savedId(value: unknown, expected?: string, created?: ProductInput): string {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !/^[-\x21-\x7e]{1,36}$/.test(value.id)
    || (expected !== undefined && value.id !== expected) || !('name' in value) || typeof value.name !== 'string'
    || !('slug' in value) || typeof value.slug !== 'string' || !('status' in value) || typeof value.status !== 'string' || !['active', 'draft'].includes(value.status)
    || !('archivedAt' in value) || value.archivedAt !== null) throw new ApiError(502, unknownOutcome);
  if (created && (value.slug !== created.slug || value.name !== created.name || value.status !== 'draft')) throw new ApiError(502, unknownOutcome);
  return value.id;
}

/** One owner per retained product section. Reads can supersede reads; writes are never retried. */
export function createAdminProducts(session: Session, view: AdminProductsView, runtime: AdminProductsRuntime, initial: AdminProductRoute) {
  let active = true, busy = false, awaitingCommittedView = false, route = initial, operation = 0;
  let childMutation: object | undefined;
  let listing = initial.view === 'list' ? initial : { view: 'list' as const, page: 1, search: '' };
  let request: AbortController | undefined, retryRoute: AdminProductRoute | undefined;
  const epoch = session.getEpoch();
  const current = () => active && session.getEpoch() === epoch && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  /** Variant writes share the parent's read/write boundary, not just its disabled controls. */
  function beginMutation(): ProductMutationLease | null {
    if (!current() || busy || awaitingCommittedView) return null;
    const identity = ++operation, token = {}; childMutation = token; busy = true;
    retryRoute = undefined; request?.abort(); view.loading(false);
    const lease = { current: () => current() && operation === identity,
      release() { if (childMutation === token) { childMutation = undefined; busy = false; } } };
    if (!lease.current()) { lease.release(); return null; }
    return lease;
  }
  async function navigate(next: AdminProductRoute) {
    if (!current() || busy) return;
    operation++;
    request?.abort(); const controller = new AbortController(); request = controller;
    const accepts = () => current() && request === controller && !controller.signal.aborted;
    retryRoute = undefined; view.error('', false); view.loading(true);
    if (!accepts()) return;
    try {
      const html = await runtime.read(next, controller.signal);
      if (!accepts()) return;
      view.render(html, next);
      if (!accepts()) return;
      awaitingCommittedView = false; route = { ...next }; if (next.view === 'list') listing = { ...next };
      view.focus();
    } catch (failure) {
      if (!accepts()) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      retryRoute = { ...next }; view.error(failure instanceof Error ? failure.message : 'No se pudo cargar el artículo.', true);
    } finally { if (accepts()) view.loading(false); }
  }

  async function mutate(method: 'POST' | 'PUT' | 'DELETE', id?: string, input?: ProductInput, transition?: 'publish' | 'unpublish', price?: InitialPrice) {
    const csrf = session.getSnapshot().csrf;
    const page = 'id' in route ? route.page : undefined;
    if (!current() || busy || awaitingCommittedView || !csrf) return;
    const identity = ++operation, accepts = () => current() && operation === identity;
    busy = true; retryRoute = undefined; request?.abort(); view.loading(false); view.error('', false); view.busy(true);
    if (!accepts()) return;
    try {
      const path = `/admin/catalog/products${price ? '/with-price' : id === undefined ? '' : `/${encodeURIComponent(id)}`}${transition ? '/' + transition : ''}`;
      const result = await runtime.request(path, { method, ...(input ? { body: price ? { product: input, price } : input } : {}), csrf });
      if (!accepts()) return;
      if (method === 'DELETE' && result !== undefined) throw new ApiError(502, unknownOutcome);
      const productId = method === 'DELETE' ? id! : savedId(result, id, method === 'POST' && !id ? input : undefined);
      if (method === 'PUT' && input && view.informationSaved) { view.informationSaved(input); return; }
      // Once acknowledged, remove the editor before reading the detail: a failed read must not offer a duplicate create.
      awaitingCommittedView = true; route = { view: 'detail', id: productId, ...(page ? { page } : {}) }; busy = false; view.busy(false);
      if (!accepts()) return;
      view.committed({ productId, archived: method === 'DELETE' });
      if (accepts()) await navigate(route);
    } catch (failure) {
      if (!accepts()) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      view.error(failure instanceof Error ? failure.message : unknownOutcome, false);
    } finally { if (accepts()) { busy = false; view.busy(false); } }
  }
  return {
    navigate, beginMutation, route: () => route,
    list: (page = listing.page, search = listing.search, filters: ProductListFilters = listing) => navigate({ view: 'list', page, search,
      ...(filters.status && filters.status !== 'all' ? { status: filters.status } : {}), ...(filters.sort && filters.sort !== 'name_asc' ? { sort: filters.sort } : {}) }),
    cancel: () => navigate(route.view === 'edit' || route.view === 'variant-create' || route.view === 'variant-edit'
      ? { view: 'detail', id: route.id, ...(route.page ? { page: route.page } : {}) } : listing),
    save: (input: ProductInput, price?: InitialPrice) => route.view === 'create' ? mutate('POST', undefined, input, undefined, price)
      : route.view === 'edit' || route.view === 'detail' ? mutate('PUT', route.id, input) : Promise.resolve(),
    transition: (action: 'publish' | 'unpublish') => route.view === 'detail' || route.view === 'edit' ? mutate('POST', route.id, undefined, action) : Promise.resolve(),
    archive: async (readOnly: boolean) => {
      if (!current() || busy || readOnly || (route.view !== 'detail' && route.view !== 'edit') || !runtime.confirm()) return;
      await mutate('DELETE', route.id);
    },
    retry: () => { if (retryRoute) void navigate(retryRoute); },
    dispose: () => { active = false; request?.abort(); },
  };
}
