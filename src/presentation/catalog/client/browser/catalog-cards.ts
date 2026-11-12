import type { createCartStore } from '../../../cart/client/state/cart-store';
import { renderDiscountPrice } from './discount-price';
import { parseCardData } from '../../shared/card-data';
import { createCatalogCard } from '../state/catalog-card';
import { mountCatalogZoom } from './catalog-zoom';
import { mountCatalogGalleries } from './catalog-gallery';
import { renderCardChoices, updateCardChoices } from './card-choices';
import { mountCardInfo } from './card-info';
import type { Product } from '../../shared/storefront-types';

export function mountCatalogCards(cart: ReturnType<typeof createCartStore>, root: ParentNode = document) {
  const dialog = root.querySelector<HTMLDialogElement>('[data-info-dialog]');
  if (!dialog || typeof dialog.showModal !== 'function') return () => {};
  let dispose: (() => void) | undefined;
  const start = () => {
    if (dispose) return;
    const info = mountCardInfo(dialog), zoom = mountCatalogZoom(root);
    const cleanup: Array<() => void> = [mountCatalogGalleries(root, zoom.update), () => zoom.dispose(), () => info.dispose()];
    for (const card of root.querySelectorAll<HTMLElement>('[data-catalog-card]')) {
      const link = card.querySelector<HTMLAnchorElement>('[data-card-link]'), options = card.querySelector<HTMLElement>('[data-card-options]');
      const infoLink = card.querySelector<HTMLAnchorElement>('[data-card-info]');
      const moreLink = card.querySelector<HTMLAnchorElement>('[data-card-more]');
      const infoLinks = [infoLink, moreLink].filter((item): item is HTMLAnchorElement => item !== null);
      const purchase = card.querySelector<HTMLElement>('[data-card-purchase]'), add = card.querySelector<HTMLButtonElement>('[data-card-add]');
      const price = card.querySelector<HTMLElement>('[data-card-price]'), status = card.querySelector<HTMLElement>('[data-card-status]'), error = card.querySelector<HTMLElement>('[data-card-error]');
      if (!link || !options || !purchase || !add || !price || !status || !error) continue;
      let initial: Product;
      try { initial = parseCardData(card.dataset.cardBootstrap ?? ''); } catch { continue; }
      const state = createCatalogCard(initial, cart.addVerified), path = new URL(link.href).pathname;
      let previous: Product | undefined;
      const open = (trigger: HTMLElement) => {
        const snapshot = state.snapshot();
        if (!snapshot.pending) void info.open(snapshot.product, trigger, link);
      };
      const choose = (trigger: HTMLElement) => {
        const snapshot = state.snapshot();
        if (!snapshot.pending) void info.choose(snapshot.product, trigger, snapshot.selected?.id ?? '', state.receive, link);
      };
      const render = () => {
        const snapshot = state.snapshot();
        if (previous !== snapshot.product) { renderCardChoices(options, snapshot.product, state.select, choose); previous = snapshot.product; }
        updateCardChoices(options, snapshot.selected, snapshot.pending);
        renderDiscountPrice(price, snapshot.selected, snapshot.product.variantCount === 0 ? 'Sin opciones disponibles' : 'Elegí una opción', card.querySelector<HTMLElement>('[data-card-discount]'));
        price.dataset.priceState = snapshot.selected ? 'price' : 'prompt';
        link.href = path + (snapshot.selected ? `?variant=${encodeURIComponent(snapshot.selected.id)}` : '');
        for (const infoLink of infoLinks) infoLink.href = link.href;
        add.disabled = snapshot.pending || !snapshot.selected || !cart.getSnapshot().ready;
        add.textContent = snapshot.pending ? 'Agregando…' : 'Agregar';
        status.textContent = snapshot.message; error.textContent = snapshot.error; error.hidden = !snapshot.error;
        purchase.hidden = snapshot.product.variantCount === 0;
      };
      const onAdd = () => { void state.add(); };
      for (const trigger of [link, ...infoLinks]) {
        const onInfo = (event: MouseEvent) => {
          if (event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
          event.preventDefault(); open(trigger);
        };
        trigger.addEventListener('click', onInfo); trigger.setAttribute('aria-haspopup', 'dialog');
        cleanup.push(() => trigger.removeEventListener('click', onInfo));
      }
      add.addEventListener('click', onAdd);
      const unsubscribe = state.subscribe(render), unsubscribeCart = cart.subscribe(render); render();
      cleanup.push(() => { state.dispose(); unsubscribe(); unsubscribeCart(); add.removeEventListener('click', onAdd); });
    }
    dispose = () => cleanup.forEach(clean => clean());
  };
  const suspend = () => { dispose?.(); dispose = undefined; };
  window.addEventListener('pagehide', suspend); window.addEventListener('pageshow', start); start();
  return () => { suspend(); window.removeEventListener('pagehide', suspend); window.removeEventListener('pageshow', start); };
}
