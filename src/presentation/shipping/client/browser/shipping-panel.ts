import type { createCartStore } from '../../../cart/client/state/cart-store';
import { formatPrice } from '../../../shared/cart/cart';
import { ShippingSession } from '../../../shared/shipping/shipping-session';
import { cartShippingIdentity, shippingPanelState } from '../state/shipping-presentation';
import { createShippingLifecycle } from '../state/shipping-runtime';
import { mountShippingOptions } from './shipping-options';

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing shipping element: ${selector}`);
  return node;
}

/** Cart changes synchronize shipping; shipping notifications only render, never synchronize. */
export function mountShippingPanel(cart: ReturnType<typeof createCartStore>, mode: 'api' | 'demo') {
  const session = new ShippingSession(), lifecycle = createShippingLifecycle(session);
  const postal = required<HTMLInputElement>('[data-shipping-postal]');
  const candidates = required<HTMLSelectElement>('[data-shipping-candidates]');
  const candidatesBox = required<HTMLElement>('[data-shipping-candidates-box]');
  const message = required<HTMLElement>('[data-shipping-message]'), error = required<HTMLElement>('[data-shipping-error]');
  const retry = required<HTMLButtonElement>('[data-shipping-retry]'), busy = required<HTMLElement>('[data-shipping-controls]');
  const shipping = required<HTMLElement>('[data-shipping-amount]'), total = required<HTMLElement>('[data-shipping-total]');
  const options = mountShippingOptions(required<HTMLFieldSetElement>('[data-shipping-options]'), (index, point) => session.select(index, point), () => postal.focus());
  let optionsKey = '';
  const render = () => {
    const snapshot = session.getSnapshot(), view = shippingPanelState(cart.getSnapshot(), mode, snapshot);
    if (postal.value !== snapshot.postalCode) postal.value = snapshot.postalCode;
    postal.setAttribute('aria-invalid', String(view.invalid)); error.hidden = !view.invalid;
    busy.setAttribute('aria-busy', String(view.busy));
    message.textContent = view.message;
    retry.disabled = !view.canCalculate;
    retry.textContent = view.busy ? 'Calculando…' : snapshot.quote || snapshot.expired ? 'Recalcular' : 'Calcular';
    candidatesBox.hidden = !view.showCandidates;
    const key = JSON.stringify(snapshot.lookup.candidates);
    if (key !== optionsKey) {
      optionsKey = key;
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Elegí tu localidad';
      candidates.replaceChildren(placeholder);
      for (const candidate of snapshot.lookup.candidates) {
        const option = document.createElement('option'); option.value = candidate.id; option.textContent = candidate.label; candidates.append(option);
      }
    }
    candidates.value = snapshot.candidateId ?? '';
    shipping.textContent = view.shipping ? formatPrice(BigInt(view.shipping.amountMinor), view.shipping.currency) : 'A calcular';
    total.textContent = view.total ? formatPrice(view.total.amountMinor, view.total.currency) : 'A calcular';
    options.update(view.choices, view.choiceKey);
  };
  const syncCart = () => {
    const state = cart.getSnapshot(), identity = cartShippingIdentity(state, mode);
    session.syncCart(mode, identity.lines, state.unresolved, identity.totalsKey);
    // Unresolved revalidation can intentionally avoid a session publication.
    render();
  };
  const editPostal = () => session.setPostalCode(postal.value);
  const selectCandidate = () => session.selectDestination(candidates.value);
  const refresh = () => { if (!retry.disabled) session.retry(); };
  const enterPostal = (event: KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); refresh(); } };
  postal.addEventListener('input', editPostal); candidates.addEventListener('change', selectCandidate); retry.addEventListener('click', refresh);
  postal.addEventListener('keydown', enterPostal);
  let stop: (() => void) | undefined;
  return {
    session,
    start() {
      if (stop) throw new Error('Shipping panel already started');
      const unsubscribeShipping = session.subscribe(render), unsubscribeCart = cart.subscribe(syncCart);
      syncCart(); const stopLifecycle = lifecycle.start(); render();
      let stopped = false;
      const cleanup = () => {
        if (stopped) return; stopped = true;
        unsubscribeCart(); unsubscribeShipping(); stopLifecycle();
        if (stop === cleanup) stop = undefined;
      };
      stop = cleanup;
      return cleanup;
    },
    dispose() {
      stop?.(); postal.removeEventListener('input', editPostal); candidates.removeEventListener('change', selectCandidate); retry.removeEventListener('click', refresh);
      postal.removeEventListener('keydown', enterPostal);
    },
  };
}
