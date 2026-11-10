import { cardOptions } from '../../shared/card-options';
import type { Product, Variant } from '../../shared/storefront-types';

type Add = (productId: string, variantId: string, signal?: AbortSignal) => Promise<{ variant: Variant }>;

/** Selection is local to this card, never a catalog query or product-route selection. */
export function createCatalogCard(initial: Product, addVerified: Add) {
  let product = initial, selected = cardOptions(initial).selected, pending = false, message = '', error = '', active = true;
  const listeners = new Set<() => void>(); let request: AbortController | undefined;
  const publish = () => { for (const listener of listeners) listener(); };
  const select = (id: string) => {
    if (!active || pending) return;
    if (!id) { selected = undefined; message = ''; error = ''; publish(); return; }
    const variant = product.variants.find(option => option.id === id);
    if (!variant) return;
    selected = variant; message = ''; error = ''; publish();
  };
  return {
    snapshot: () => ({ product, selected, pending, message, error }), select,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    receive(detail: Product, id: string) {
      if (!active || pending || detail.id !== product.id || detail.slug !== product.slug || !detail.variants.some(option => option.id === id)) return;
      product = { ...product, ...detail }; select(id);
    },
    async add() {
      if (!active || pending) return;
      if (!selected) { error = 'Elegí una opción antes de agregar.'; publish(); return; }
      const variant = selected; request = new AbortController();
      pending = true; error = ''; message = ''; publish();
      try {
        const receipt = await addVerified(product.id, variant.id, request.signal);
        if (!active) return;
        selected = receipt.variant; message = 'Agregado al carrito';
      } catch (cause) {
        if (active) error = cause instanceof Error ? cause.message : 'No se pudo agregar. Volvé a intentarlo.';
      } finally { if (active) { pending = false; publish(); } }
    },
    dispose() { active = false; request?.abort(); listeners.clear(); },
  };
}
