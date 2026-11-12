import { ApiError, apiRequest } from '../../api';
import { canManageCatalog, type createSessionStore } from '../../session-core';
import type { VariantInput } from '../../types';
import type { ProductMutationLease } from './product-controller';
import type { StockInput } from './inventory-form';

type Session = Pick<ReturnType<typeof createSessionStore>, 'getSnapshot' | 'getEpoch' | 'expire'>;
type View = { busy(value: boolean): void; error(message: string): void; committed(): void; stockSaved?(id: string, quantity: number): void };
type Runtime = { request: typeof apiRequest; confirm(): boolean };
type Price = Pick<VariantInput, 'priceMinor' | 'currency' | 'supplyMode' | 'salePriceMinor'>;
const validId = (id: string) => /^[-\x21-\x7e]{1,36}$/.test(id);
const uncertain = 'No se pudo confirmar el resultado. La operación podría haberse completado; revise las variantes antes de reintentar.';
function confirmed(value: unknown, productId: string, id?: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && validId(item.id) && (id === undefined || item.id === id) && item.productId === productId
    && typeof item.sku === 'string' && Boolean(item.sku.trim()) && typeof item.name === 'string' && Boolean(item.name.trim())
    && typeof item.priceMinor === 'string' && /^\d+$/.test(item.priceMinor) && typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency)
    && typeof item.supplyMode === 'string' && ['stock', 'made_to_order'].includes(item.supplyMode) && item.archivedAt === null;
}

/** Variant writes stay scoped to one product/view/authentication epoch; the product owner renders subsequent reads. */
export function createVariantEditor(session: Session, view: View, productId: string, readOnly: boolean,
  runtime: Runtime = { request: apiRequest, confirm: () => window.confirm('¿Archivar esta variante? Esta acción no se puede deshacer desde este panel.') },
  reserve?: () => ProductMutationLease | null) {
  let active = true, busy = false; const epoch = session.getEpoch();
  let reservation: ProductMutationLease | null | undefined;
  const current = () => active && session.getEpoch() === epoch && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  async function write(method: 'POST' | 'PUT' | 'DELETE', id?: string, body?: VariantInput | Price | StockInput, action = '') {
    const csrf = session.getSnapshot().csrf;
    if (!current() || busy || readOnly || !csrf || !validId(productId) || (id !== undefined && !validId(id))) return;
    const lease = reserve?.(); if (reserve && !lease) return;
    reservation = lease; const accepts = () => current() && (!lease || lease.current());
    busy = true; view.error(''); view.busy(true); if (!accepts()) { lease?.release(); return; }
    try {
      const result = await runtime.request(`/admin/catalog/products/${encodeURIComponent(productId)}/variants${id === undefined ? '' : `/${encodeURIComponent(id)}`}${action}`,
        { method, ...(body ? { body } : {}), csrf });
      if (!accepts()) return;
      const receipt = result as { id?: string; productId?: string; stockQuantity?: number } | undefined;
      const valid = action === '/stock' ? receipt?.id === id && receipt?.productId === productId && receipt?.stockQuantity === (body as StockInput).stockQuantity : confirmed(result, productId, id);
      if (method === 'DELETE' ? result !== undefined : !valid) throw new ApiError(502, uncertain);
      if (body && 'salePriceMinor' in body && body.salePriceMinor !== undefined) {
        const saved = (result as { salePriceMinor?: string | null }).salePriceMinor ?? null;
        if (saved !== (body.salePriceMinor === null ? null : String(body.salePriceMinor))) throw new ApiError(502, uncertain);
      }
      busy = false; lease?.release(); view.busy(false);
      if (accepts()) { if (action === '/stock' && view.stockSaved) view.stockSaved(id!, (body as StockInput).stockQuantity); else view.committed(); }
    } catch (failure) {
      if (!accepts()) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      if (action === '/stock' && failure instanceof ApiError && failure.status === 409) { view.error('El stock o la modalidad cambió. Vuelva a abrir el producto para revisar la cantidad actual antes de guardar.'); return; }
      view.error(failure instanceof Error ? failure.message : uncertain);
    } finally {
      lease?.release(); if (reservation === lease) reservation = undefined;
      if (accepts()) { busy = false; view.busy(false); }
    }
  }
  return {
    save: (body: VariantInput, id?: string) => write(id === undefined ? 'POST' : 'PUT', id, body),
    savePrice: ({ priceMinor, currency, supplyMode, salePriceMinor }: Price, id: string) => write('PUT', id, { priceMinor, currency, supplyMode, ...(salePriceMinor !== undefined ? { salePriceMinor } : {}) }, '/price'),
    saveStock: (body: StockInput, id: string) => write('PUT', id, body, '/stock'),
    archive: async (id: string, archived: boolean) => { if (current() && !busy && !readOnly && !archived && runtime.confirm()) await write('DELETE', id); },
    dispose: () => { active = false; reservation?.release(); reservation = undefined; },
  };
}
