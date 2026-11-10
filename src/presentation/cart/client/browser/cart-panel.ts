import { cartCountLabel, formatPrice } from '../../../shared/cart/cart';
import { pairKey } from '../../../shared/cart/cart-resolution';
import { createCartStore } from '../state/cart-store';
import { cartRow, element } from './cart-row';
import { mountShippingPanel } from '../../../shipping/client/browser/shipping-panel';
import { mountCartSurface } from './cart-surface';
import { renderCartChrome } from './cart-chrome';
import { STOREFRONT_DATA_MODE } from '../../../shared/runtime/data-mode';
import { createDeliveryHint, deliveryHintKey } from '../../../shared/checkout/checkout-handoff';
import { cartShippingIdentity, shippingPanelState } from '../../../shipping/client/state/shipping-presentation';

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing cart element: ${selector}`);
  return node;
}

/** Bind server markup once. Native dialog owns focus trapping and Escape behavior. */
export function mountCartPanel() {
  const mode = STOREFRONT_DATA_MODE;
  const productBase = required<HTMLElement>('[data-cart-mode]').dataset.productBase ?? '/productos';
  if (!['/productos'].includes(productBase)) throw new Error('Invalid product route');
  const store = createCartStore(mode), dialog = required<HTMLDialogElement>('[data-cart-dialog]');
  const open = required<HTMLButtonElement>('[data-cart-open]'), close = required<HTMLButtonElement>('[data-cart-close]');
  const surface = mountCartSurface(dialog, required<HTMLElement>('[data-cart-content]'), document.querySelector<HTMLElement>('[data-cart-page-slot]'));
  const list = required<HTMLUListElement>('[data-cart-list]'), empty = required<HTMLElement>('[data-cart-empty]');
  const badge = required<HTMLElement>('[data-cart-badge]'), filled = required<HTMLElement>('[data-cart-filled]');
  const count = required<HTMLElement>('[data-cart-count]'), status = required<HTMLElement>('[data-cart-status]');
  const warning = required<HTMLElement>('[data-cart-warning]'), totals = required<HTMLElement>('[data-cart-totals]');
  const retry = required<HTMLButtonElement>('[data-cart-retry]'), announcement = required<HTMLElement>('[data-cart-announcement]');
  const rows = new Map<string, ReturnType<typeof cartRow>>();
  let pending: { key: string; index: number; name: string } | undefined;
  const render = () => {
    const state = store.getSnapshot();
    open.disabled = !state.ready || surface.isLocked();
    renderCartChrome(state, { trigger: open, badge, empty, filled });
    count.textContent = cartCountLabel(state.items.length, state.count);
    warning.textContent = state.storageTabOnly ? 'Carrito guardado solo en esta pestaña.' : state.storageUnavailable ? 'El almacenamiento no está disponible: este carrito es temporal.' : '';
    status.textContent = state.mutationError || (state.stockShortage ? 'La cantidad supera el stock disponible. Reduzca las unidades o elimine el artículo.' : '') || state.bulkWarnings.map(warning => warning.text).join(' ') || (state.status === 'error' ? 'No se pudo verificar el carrito. Se conservan tus artículos.' : state.status === 'loading' ? 'Verificando artículos…' : state.removedNotice ? 'Se retiraron artículos que ya no están disponibles.' : '');
    warning.hidden = !warning.textContent; status.hidden = !status.textContent;
    retry.hidden = state.status !== 'error';
    const keys = new Set(state.items.map(pairKey));
    for (const [key, row] of rows) if (!keys.has(key)) { row.root.remove(); rows.delete(key); }
    state.items.forEach((item, index) => {
      const key = pairKey(item);
      let row = rows.get(key);
      if (!row) {
        row = cartRow(item, false, (difference, current) => {
          if (difference === null || (difference < 0 && current.quantity === 1)) {
            pending = { key, index: store.getSnapshot().items.findIndex(item => pairKey(item) === key), name: current.product?.name ?? 'El artículo' };
            announcement.textContent = '';
          }
          if (difference === null) void store.remove(current.productId, current.variantId);
          else void store.adjust(current.productId, current.variantId, difference);
        }, productBase);
        rows.set(key, row);
      }
      row.update(item, index);
      // Moving a focused node also loses focus in some browsers; do not move stable rows.
      if (list.children[index] !== row.root) list.insertBefore(row.root, list.children[index] ?? null);
    });
    totals.replaceChildren();
    for (const [currency, value] of Object.entries(state.totals)) totals.append(element('dt', `${state.unresolved ? 'Subtotal parcial' : 'Subtotal'} ${currency}`), element('dd', formatPrice(value, currency)));
    if (pending && !keys.has(pending.key)) {
      announcement.textContent = `${pending.name} se quitó del carrito.`;
      if (surface.visible()) {
        const next = state.items[Math.min(pending.index, state.items.length - 1)];
        if (next) rows.get(pairKey(next))?.focus(); else required<HTMLElement>('[data-cart-empty-focus]').focus();
      }
      pending = undefined;
    }
  };
  const show = () => { if (!surface.isLocked()) { surface.open(); close.focus(); } };
  const hide = () => surface.close();
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); hide(); }
  };
  const again = () => store.retry();
  open.addEventListener('click', show); close.addEventListener('click', hide); retry.addEventListener('click', again);
  dialog.addEventListener('keydown', escape);
  const unsubscribe = store.subscribe(render);
  const shipping = mountShippingPanel(store, mode);
  const checkout = document.querySelector<HTMLAnchorElement>('[data-cart-checkout]');
  const saveDelivery = () => {
    const cart = store.getSnapshot(), snapshot = shipping.session.getSnapshot();
    const view = shippingPanelState(cart, mode, snapshot);
    const hint = view.coherent ? createDeliveryHint(snapshot, view.choiceKey, cartShippingIdentity(cart, mode).lines) : null;
    try { if (hint) sessionStorage.setItem(deliveryHintKey, hint); else sessionStorage.removeItem(deliveryHintKey); }
    catch { /* An optional preference must not block navigation or replace server validation. */ }
  };
  checkout?.addEventListener('click', saveDelivery);
  let stop: (() => void) | undefined, stopShipping: (() => void) | undefined;
  const start = () => { if (!stop) { stopShipping = shipping.start(); stop = store.start(); } };
  const suspend = () => { stop?.(); stop = undefined; stopShipping?.(); stopShipping = undefined; };
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', start);
  render(); start();
  const dispose = () => {
    suspend(); unsubscribe(); shipping.dispose(); window.removeEventListener('pagehide', suspend); window.removeEventListener('pageshow', start);
    open.removeEventListener('click', show); close.removeEventListener('click', hide); retry.removeEventListener('click', again);
    dialog.removeEventListener('keydown', escape);
    surface.dispose();
    checkout?.removeEventListener('click', saveDelivery);
  };
  return { store, shippingSession: shipping.session, open: show, close: hide, setLocked(value: boolean) { surface.setLocked(value); render(); }, dispose };
}
