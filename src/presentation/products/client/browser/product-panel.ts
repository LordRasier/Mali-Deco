import type { createCartStore } from '../../../cart/client/state/cart-store';
import { formatPrice } from '../../../shared/cart/cart';
import { parseProductDetailResponse } from '../../../shared/catalog/api-catalog';
import { createProductStore } from '../state/product-store';
import { mountProductGallery } from './product-gallery';
import { STOREFRONT_DATA_MODE } from '../../../shared/runtime/data-mode';
import { renderPropertyChoices, updatePropertyChoices } from '../../../catalog/client/browser/property-choices';

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector); if (!element) throw new Error(`Missing product control: ${selector}`); return element;
}

export function mountProductPanel(cart: ReturnType<typeof createCartStore>, openCart: () => void) {
  const root = document.querySelector<HTMLElement>('[data-product-bootstrap]');
  if (!root) return () => {};
  const mode = STOREFRONT_DATA_MODE;
  const initial = parseProductDetailResponse(JSON.parse(root.dataset.productBootstrap ?? ''));
  const product = createProductStore(initial.product, initial.total, mode);
  const variants = required<HTMLElement>(root, '[data-product-variants]');
  const price = required<HTMLElement>(root, '[data-product-price]'), selected = required<HTMLElement>(root, '[data-product-selected]');
  const availability = root.querySelector<HTMLElement>('[data-product-availability]');
  const warning = required<HTMLElement>(root, '[data-product-warning]'), status = required<HTMLElement>(root, '[data-product-status]');
  const add = required<HTMLButtonElement>(root, '[data-product-add]'), more = required<HTMLButtonElement>(root, '[data-product-more]');
  const retry = required<HTMLButtonElement>(root, '[data-product-retry]'), pageRetry = required<HTMLButtonElement>(root, '[data-product-page-retry]');
  const pageError = required<HTMLElement>(root, '[data-product-page-error]'), reset = required<HTMLButtonElement>(root, '[data-product-reset]');
  const buttons = new Map(Array.from(variants.querySelectorAll<HTMLButtonElement>('[data-product-variant]')).map(button => [button.dataset.productVariant!, button]));
  let active = false, generation = 0, pendingFocus: string | undefined;
  let propertySet = '', grouped = false;
  const render = () => {
    const state = product.getSnapshot();
    const shown = state.selected && !state.variants.some(item => item.id === state.selected?.id) ? [state.selected, ...state.variants] : state.variants;
    const set = JSON.stringify(shown.map(v => [v.id, v.material, v.colorInfo, v.options]));
    if (set !== propertySet) { propertySet = set; const wasGrouped = grouped;
      grouped = renderPropertyChoices(variants, shown, id => { if (active) product.choose(id); });
      if (wasGrouped && !grouped) { variants.replaceChildren(); variants.classList.remove('variant-property-choices'); }
    }
    if (grouped) updatePropertyChoices(variants, state.selected, !active || state.status !== 'ready');
    else {
    const visible = new Set(shown.map(item => item.id)), colored = shown.every(item => !!item.color && /^#[0-9a-f]{6}$/i.test(item.color));
    for (const [id, button] of buttons) if (!visible.has(id)) { button.remove(); buttons.delete(id); }
    shown.forEach((variant, index) => {
      let button = buttons.get(variant.id);
      if (!button) { button = document.createElement('button'); button.type = 'button'; button.dataset.productVariant = variant.id; buttons.set(variant.id, button); }
      button.disabled = !active; button.setAttribute('aria-label', variant.name); button.title = variant.name;
      button.setAttribute('aria-pressed', String(state.selected?.id === variant.id));
      button.classList.toggle('product-swatch', colored); button.textContent = colored ? '' : variant.name;
      // A validated property assignment needs no unsafe-inline policy or CSS text injection.
      button.style.backgroundColor = colored ? variant.color! : '';
      if (variants.children[index] !== button) variants.insertBefore(button, variants.children[index] ?? null);
    });
    }
    selected.textContent = state.selected?.name ?? 'Elegí una opción';
    if (availability) availability.textContent = state.selected?.supplyMode === 'made_to_order' ? 'Se fabrica a pedido' : state.selected?.supplyMode === 'stock' ? (state.selected.stockQuantity ?? 0) > 0 ? 'En stock' : 'Sin stock' : 'Consultá disponibilidad';
    price.textContent = state.selected ? formatPrice(state.selected.priceMinor, state.selected.currency) : 'Seleccioná una variante';
    warning.textContent = state.warning ?? ''; warning.hidden = !state.warning;
    status.textContent = state.status === 'loading' ? 'Verificando variante…' : state.status === 'error' ? 'No pudimos verificar la variante.' : '';
    retry.hidden = state.status !== 'error'; more.hidden = !state.hasMore || state.pageConflict;
    more.disabled = state.loadingMore; more.textContent = state.loadingMore ? 'Cargando variantes…' : 'Mostrar más variantes';
    pageError.hidden = !state.pageError; pageError.textContent = state.pageConflict ? 'El catálogo cambió durante la carga.' : 'No pudimos cargar más variantes.';
    pageRetry.hidden = !state.pageError || state.pageConflict; reset.hidden = !state.pageConflict;
    add.disabled = !active || !state.selected || !cart.getSnapshot().ready || state.status !== 'ready' || state.loadingMore || state.pageError;
    if (pendingFocus && state.status !== 'loading') {
      const target = buttons.get(pendingFocus); if (target) target.focus(); else if (state.warning) { warning.tabIndex = -1; warning.focus(); }
      pendingFocus = undefined;
    }
  };
  const choose = (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-product-variant]') : null;
    if (active && button?.dataset.productVariant) { pendingFocus = button.dataset.productVariant; product.choose(pendingFocus); }
  };
  const addItem = async () => {
    const state = product.getSnapshot(), lifecycle = generation;
    if (add.disabled || !active || !state.selected) return;
    await cart.add(initial.product.id, state.selected.id);
    if (active && lifecycle === generation) openCart();
  };
  const retrySelection = () => product.retry(), loadMore = () => { void product.loadMore(); }, reload = () => window.location.reload();
  variants.addEventListener('click', choose); add.addEventListener('click', addItem);
  retry.addEventListener('click', retrySelection); more.addEventListener('click', loadMore); pageRetry.addEventListener('click', loadMore); reset.addEventListener('click', reload);
  const unsubscribeProduct = product.subscribe(render), unsubscribeCart = cart.subscribe(render), disposeGallery = mountProductGallery(root);
  let stop: (() => void) | undefined;
  const start = () => { if (!active) { active = true; generation++; stop = product.start(); } };
  const suspend = () => { active = false; generation++; stop?.(); stop = undefined; };
  window.addEventListener('pagehide', suspend); window.addEventListener('pageshow', start); render(); start();
  return () => {
    suspend(); unsubscribeProduct(); unsubscribeCart(); disposeGallery();
    variants.removeEventListener('click', choose); add.removeEventListener('click', addItem); retry.removeEventListener('click', retrySelection);
    more.removeEventListener('click', loadMore); pageRetry.removeEventListener('click', loadMore); reset.removeEventListener('click', reload);
    window.removeEventListener('pagehide', suspend); window.removeEventListener('pageshow', start);
  };
}
