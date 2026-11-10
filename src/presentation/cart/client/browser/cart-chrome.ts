type CartChromeState = { ready: boolean; count: number; items: readonly unknown[] };
type CartChrome = { trigger: HTMLButtonElement; badge: HTMLElement; empty: HTMLElement; filled: HTMLElement };

/** Present cart state without rebuilding the trigger or the retained shipping form. */
export function renderCartChrome(state: CartChromeState, view: CartChrome) {
  view.trigger.setAttribute('aria-label', `Abrir carrito, ${state.count} ${state.count === 1 ? 'unidad' : 'unidades'}`);
  view.badge.textContent = state.count > 99 ? '99+' : String(state.count);
  view.badge.hidden = state.count === 0;
  view.empty.hidden = !state.ready || state.items.length > 0;
  view.filled.hidden = !state.ready || state.items.length === 0;
}
