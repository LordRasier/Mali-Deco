import { mountCartPanel } from '../cart/client/browser/cart-panel';
import { mountCatalogFilters } from '../catalog/client/browser/catalog-filters';
import { mountCatalogCards } from '../catalog/client/browser/catalog-cards';
import { mountProductPanel } from '../products/client/browser/product-panel';
import { mountSiteHeader } from './site-header';
import { mountCheckout } from '../checkout/client/browser/checkout-browser';

try {
  mountSiteHeader(); const cart = mountCartPanel(); mountCatalogFilters(); mountCatalogCards(cart.store); mountProductPanel(cart.store, cart.open);
  const checkout = document.querySelector<HTMLElement>('[data-checkout-root]');
  if (checkout) mountCheckout(checkout, { cart: cart.store, shippingSession: cart.shippingSession, closeCart: cart.close, setCartLocked: cart.setLocked });
}
catch {
  const root = document.querySelector('[data-cart-mode]');
  const message = document.createElement('p'); message.setAttribute('role', 'alert');
  message.textContent = 'No se pudo iniciar una parte de la página. Podés volver a la tienda actual para continuar.';
  root?.append(message);
}
