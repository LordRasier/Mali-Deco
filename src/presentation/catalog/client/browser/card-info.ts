import { createCardDetails } from '../state/card-details';
import { formatPrice } from '../../../shared/cart/cart';
import type { Product } from '../../shared/storefront-types';

type DialogView = { kind: 'information' } | { kind: 'options'; receive: (product: Product, id: string) => void };

export function mountCardInfo(dialog: HTMLDialogElement) {
  const find = <T extends HTMLElement>(selector: string) => {
    const item = dialog.querySelector<T>(selector); if (!item) throw new Error(`Missing information control: ${selector}`); return item;
  };
  const state = createCardDetails(), title = find('[data-info-title]'), close = find<HTMLButtonElement>('[data-info-close]');
  const loading = find('[data-info-loading]'), error = find('[data-info-error]'), retry = find<HTMLButtonElement>('[data-info-retry]');
  const content = find('[data-info-content]'), general = find('[data-info-general]'), description = find('[data-info-description]'), dimensions = find('[data-info-dimensions]');
  const options = find('[data-info-options]'), choice = find<HTMLSelectElement>('[data-info-choice]'), count = find('[data-info-count]');
  const more = find<HTMLButtonElement>('[data-info-more]'), use = find<HTMLButtonElement>('[data-info-use]');
  let trigger: HTMLElement | undefined, fallback: HTMLElement | undefined, view: DialogView | undefined;
  let selected = '', previous: Product | undefined, overflow = '';
  const render = () => {
    const snapshot = state.snapshot(), product = snapshot.product;
    loading.hidden = !snapshot.loading; error.hidden = !snapshot.error; error.textContent = snapshot.error; retry.hidden = !snapshot.error;
    retry.disabled = snapshot.loading; content.hidden = !product;
    general.hidden = view?.kind !== 'information';
    options.hidden = view?.kind !== 'options' || !product || snapshot.total === 0;
    if (!product) { previous = undefined; use.disabled = true; return; }
    if (product !== previous) {
      title.textContent = view?.kind === 'options' ? `Opciones · ${product.name}` : product.name;
      description.textContent = product.description || 'No hay una descripción informada.';
      dimensions.replaceChildren();
      for (const [label, value] of [['Ancho', product.productWidthMm], ['Alto', product.productHeightMm], ['Largo', product.productLengthMm]] as const) {
        if (!value) continue;
        const term = document.createElement('dt'), definition = document.createElement('dd');
        term.textContent = label; definition.textContent = `${value} mm`; dimensions.append(term, definition);
      }
      dimensions.hidden = !dimensions.children.length;
      if (view?.kind === 'options') {
        selected = choice.value || selected; choice.replaceChildren(new Option('Elegí una opción', ''));
        for (const variant of product.variants) choice.add(new Option(`${variant.name} · ${formatPrice(variant.priceMinor, variant.currency)}`, variant.id));
        choice.value = selected;
      }
      previous = product;
    }
    choice.disabled = snapshot.loading;
    count.textContent = `${product.variants.length} de ${snapshot.total} opciones`;
    more.hidden = !snapshot.hasMore; more.disabled = snapshot.loading || !!snapshot.error;
    use.disabled = view?.kind !== 'options' || !choice.value || snapshot.loading || !!snapshot.error;
  };
  const unsubscribe = state.subscribe(render);
  const onClose = () => {
    state.close(); document.documentElement.style.overflow = overflow;
    const target = trigger?.isConnected ? trigger : fallback; trigger = undefined; fallback = undefined; view = undefined; target?.focus({ preventScroll: true });
  };
  const onChoice = () => { selected = choice.value; render(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !dialog.open) return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href]'))
      .filter(control => control.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
  };
  const onUse = () => {
    const product = state.snapshot().product;
    if (view?.kind === 'options' && !use.disabled && product && product.variants.some(variant => variant.id === choice.value)) { view.receive(product, choice.value); dialog.close(); }
  };
  const onMore = () => { void state.more(); }, onRetry = () => { void state.retry(); }, onClickClose = () => dialog.close();
  dialog.addEventListener('close', onClose); dialog.addEventListener('keydown', onKeyDown); close.addEventListener('click', onClickClose); choice.addEventListener('change', onChoice);
  use.addEventListener('click', onUse); more.addEventListener('click', onMore); retry.addEventListener('click', onRetry);
  const show = (product: Product, opener: HTMLElement, nextView: DialogView, selectedId: string, focusFallback?: HTMLElement) => {
    if (dialog.open) return Promise.resolve();
    trigger = opener; fallback = focusFallback; view = nextView; selected = selectedId; previous = undefined; choice.replaceChildren();
    title.textContent = view.kind === 'options' ? `Opciones · ${product.name}` : product.name;
    close.setAttribute('aria-label', view.kind === 'options' ? 'Cerrar opciones' : 'Cerrar información');
    overflow = document.documentElement.style.overflow;
    dialog.showModal(); document.documentElement.style.overflow = 'hidden'; close.focus({ preventScroll: true });
    return state.open(product);
  };
  return {
    open(product: Product, opener: HTMLElement, focusFallback?: HTMLElement) {
      return show(product, opener, { kind: 'information' }, '', focusFallback);
    },
    choose(product: Product, opener: HTMLElement, selectedId: string, receive: (product: Product, id: string) => void, focusFallback?: HTMLElement) {
      return show(product, opener, { kind: 'options', receive }, selectedId, focusFallback);
    },
    close() { if (dialog.open) dialog.close(); else state.close(); },
    dispose() {
      if (dialog.open) { dialog.close(); onClose(); }
      state.close(); unsubscribe(); dialog.removeEventListener('close', onClose); dialog.removeEventListener('keydown', onKeyDown); close.removeEventListener('click', onClickClose);
      choice.removeEventListener('change', onChoice); use.removeEventListener('click', onUse); more.removeEventListener('click', onMore); retry.removeEventListener('click', onRetry);
    },
  };
}
