import { fetchAdminSection } from '../admin-runtime';
import type { AdminProductRoute } from './product-controller';

export function fetchAdminProduct(route: AdminProductRoute, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const query = new URLSearchParams({ view: route.view });
  if (route.view === 'list') { query.set('page', String(route.page)); if (route.search) query.set('search', route.search);
    if (route.status) query.set('status', route.status); if (route.sort) query.set('sort', route.sort); }
  else if (route.view !== 'create') {
    query.set('id', route.id); if (route.page !== undefined) query.set('page', String(route.page));
    if (route.view === 'variant-edit') query.set('variantId', route.variantId);
  }
  return fetchAdminSection('products', signal, fetcher, query);
}

/** The server template owns this metadata; malformed fragments never select a mutation target. */
export function productRoute(data: Record<string, string | undefined>): AdminProductRoute {
  const status = data.productStatusFilter ?? 'all', sort = data.productSort ?? 'name_asc';
  if (data.productView === 'list' && /^[1-9][0-9]*$/.test(data.productPage ?? '') && Number(data.productPage) <= 10000
    && (data.productSearch ?? '').length <= 100 && ['all', 'active', 'draft', 'archived'].includes(status) && ['name_asc', 'name_desc'].includes(sort)) {
    return { view: 'list', page: Number(data.productPage), search: data.productSearch ?? '', ...(status !== 'all' ? { status } : {}), ...(sort !== 'name_asc' ? { sort } : {}) };
  }
  if (data.productView === 'create') return { view: 'create' };
  const page = data.productPage === undefined ? {} : /^[1-9][0-9]*$/.test(data.productPage) && Number(data.productPage) <= 10000 ? { page: Number(data.productPage) } : null;
  if (page && /^[-\x21-\x7e]{1,36}$/.test(data.productId ?? '')) {
    if (data.productView === 'detail' || data.productView === 'edit' || data.productView === 'variant-create') return { view: data.productView, id: data.productId!, ...page };
    if (data.productView === 'variant-edit' && /^[-\x21-\x7e]{1,36}$/.test(data.productVariantId ?? '')) return { view: 'variant-edit', id: data.productId!, variantId: data.productVariantId!, ...page };
  }
  throw new Error('El servicio devolvió una vista de producto inválida.');
}
