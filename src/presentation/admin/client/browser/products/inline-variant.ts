import { readAdminSection } from '../admin-fragment';
import type { AdminProductsRuntime, AdminProductRoute, ProductMutationLease } from './product-controller';
import { productRoute } from './product-runtime';

/** Import only the authorized variant form, not another shell or media owner. */
export async function loadInlineVariant(root: HTMLElement, route: Extract<AdminProductRoute, {view:'detail' | 'edit' | 'variant-create'}>,
  variantId: string | undefined, read: AdminProductsRuntime['read'], lease: ProductMutationLease, signal: AbortSignal) {
  const slot = root.querySelector<HTMLElement>('[data-inline-variant-slot]'); if (!slot) return false;
  const next: AdminProductRoute = variantId ? { view: 'variant-edit', id: route.id, page: route.page, variantId } : { view: 'variant-create', id: route.id, page: route.page };
  const html = await read(next, signal);
  if (!lease.current() || signal.aborted || !root.contains(slot)) return false;
  const section = readAdminSection(root.ownerDocument, 'products', html), actual = productRoute(section.dataset);
  if (actual.view !== next.view || !('id' in actual) || actual.id !== route.id || (actual.page ?? 1) !== (route.page ?? 1) ||
    (variantId && (actual.view !== 'variant-edit' || actual.variantId !== variantId))) throw Error('La variante recibida no corresponde al producto.');
  const form = section.querySelector<HTMLFormElement>('[data-variant-form]'); if (!form) throw Error('No se pudo cargar el editor de variantes.');
  form.dataset.inlineVariant = variantId ?? '';
  slot.replaceChildren(form); return true;
}
