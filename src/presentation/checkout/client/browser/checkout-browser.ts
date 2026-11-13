import type { CartView } from '../../../cart/client/state/cart-snapshot';
import { cartShippingIdentity } from '../../../shipping/client/state/shipping-presentation';
import { createCheckoutStore, type CheckoutShippingPort, type CheckoutStore } from '../state/checkout-store';
import { createCheckoutView } from './checkout-view';
import type { CartLine } from '../../../shared/catalog/storefront-types';

type CartPort = { getSnapshot(): CartView; subscribe(listener: () => void): () => void; completePurchase?(orderId: string, purchased: CartLine[]): Promise<void>; adjust?(productId: string, variantId: string, difference: number): Promise<unknown>; remove?(productId: string, variantId: string): Promise<unknown>; retry?(): void };
type Options = {
  cart: CartPort; shippingSession: CheckoutShippingPort; store?: CheckoutStore; lifecycle?: EventTarget;
  closeCart?: () => void; setCartLocked: (locked: boolean) => void;
};

/** Shares the cart owners. A valid cart preference may refresh a quote; orders always require submission. */
export function mountCheckout(root: HTMLElement, options: Options) {
  const store = options.store ?? createCheckoutStore(options.shippingSession, { paymentEnabled: root.dataset.paymentAvailable === 'true', recoverOnStart: true, navigate: url => window.location.assign(url) }), view = createCheckoutView(root);
  const lifecycle = options.lifecycle ?? window, subscriptions: (() => void)[] = [];
  const reconciled = new Set<string>();
  let active = false, disposed = false, generation = 0, stopStore: (() => void) | undefined, wasLocked = false;
  const render = () => {
    if (!active) return;
    const state = store.getSnapshot();
    options.setCartLocked(state.locked);
    if (state.locked && !wasLocked) options.closeCart?.();
    wasLocked = state.locked;
    view.render(state, options.shippingSession.getSnapshot(), options.cart.getSnapshot());
    const order = state.order;
    if (state.loaded && !state.sending && order?.paymentStatus === 'approved' && order.orderStatus !== 'cancelled' &&
      (!state.payment || state.payment.status === 'approved') && order.cartLines?.length && options.cart.getSnapshot().ready &&
      options.cart.completePurchase && !reconciled.has(order.id)) {
      // Mark before calling: the cart publishes synchronously during the mutation.
      reconciled.add(order.id);
      void options.cart.completePurchase(order.id, order.cartLines);
    }
  };
  const sync = () => {
    if (!active) return;
    const cart = options.cart.getSnapshot(), identity = cartShippingIdentity(cart, 'api');
    store.syncCart(identity.lines, cart.unresolved, cart.ready, identity.totalsKey); render();
  };
  const start = () => {
    if (active || disposed) return;
    active = true; const epoch = ++generation;
    subscriptions.push(store.subscribe(render), options.shippingSession.subscribe(render), options.cart.subscribe(sync));
    const cleanup = store.start();
    if (!active || epoch !== generation) { cleanup(); return; }
    stopStore = cleanup; sync();
  };
  const stop = () => {
    if (!active) return;
    active = false; generation++; reconciled.clear();
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    stopStore?.(); stopStore = undefined;
    view.resetDraft();
    options.setCartLocked(false); wasLocked = false;
  };
  view.bind({ ...store, async changeQuantity(productId, variantId, difference) {
    if (!active || !store.beginCartEdit()) return;
    const epoch = generation;
    try { if (difference === null) await options.cart.remove?.(productId, variantId); else await options.cart.adjust?.(productId, variantId, difference); }
    finally { if (active && generation === epoch) { sync(); store.endCartEdit(); } }
  } });
  lifecycle.addEventListener('pagehide', stop); lifecycle.addEventListener('pageshow', start);
  start();
  return {
    store, dispose() {
      if (disposed) return;
      disposed = true; stop(); view.dispose(); store.dispose();
      lifecycle.removeEventListener('pagehide', stop); lifecycle.removeEventListener('pageshow', start);
    },
  };
}
