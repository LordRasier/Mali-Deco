import type { CartView } from '../../../cart/client/state/cart-snapshot';
import { formatPrice } from '../../../shared/cart/cart';
import { checkoutRecoveryAvailable } from '../../../shared/checkout/checkout-client';
import type { ShippingSnapshot } from '../../../shared/shipping/shipping-session';
import { canStartNewOrder, type CheckoutSnapshot, type CheckoutStore } from '../state/checkout-store';
import { checkoutLine } from './checkout-line';
import { pairKey } from '../../../shared/cart/cart-resolution';
import { bulkWarnings } from '../../../shared/cart/inventory';

type Action = 'setContact' | 'setAddress' | 'placeOrder' | 'requestQuote' | 'findDestination' | 'setPostalCode' | 'selectDestination' | 'selectOption' | 'selectPoint' | 'retryAttempt' | 'checkPending' | 'discardSession';
type Actions = { [K in Action]: (...args: Parameters<CheckoutStore[K]>) => unknown } & { selectPayment?(method: 'mercadopago' | ''): unknown; changeQuantity?(productId: string, variantId: string, difference: number | null): unknown; startPayment?(): unknown; refreshPayment?(): unknown; startNewOrder?(): boolean };

/** Update stable form controls in place. Only read-only lists and option memberships are replaced. */
export function createCheckoutView(root: HTMLElement, recoveryAvailable = checkoutRecoveryAvailable) {
  const nodes = new Map<string, HTMLElement>(), renderedValues = new Map<string, string>();
  const listeners: (() => void)[] = [], radioListeners: (() => void)[] = [];
  let actions: Actions | undefined, optionKey = '', candidateKey = '', pointKey = '', totalsKey = '', focused = 0, focusedOrder = '';
  let focusedPayment = 0;
  let confirmedLinesKey = '';
  const rows = new Map<string, ReturnType<typeof checkoutLine>>();
  let warningNode: HTMLElement | undefined;
  const node = <T extends HTMLElement = HTMLElement>(name: string): T => {
    let found = nodes.get(name);
    if (!found) {
      found = root.querySelector<HTMLElement>(`[data-checkout-${name}]`) ?? undefined;
      if (!found) throw new Error(`Missing checkout element: ${name}`);
      nodes.set(name, found);
    }
    return found as T;
  };
  const input = (name: string) => node<HTMLInputElement>(name);
  const button = (name: string) => node<HTMLButtonElement>(name);
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const result = root.ownerDocument.createElement(tag); result.textContent = text; return result;
  };
  const listen = (target: HTMLElement, event: string, callback: (event: Event) => void, bag = listeners) => {
    target.addEventListener(event, callback); bag.push(() => target.removeEventListener(event, callback));
  };
  const clearRadios = () => { for (const remove of radioListeners.splice(0)) remove(); };
  const contact = () => ({ name: input('name').value, email: input('email').value, phone: input('phone').value, document: input('document').value });
  const address = () => ({ street: input('street').value, number: input('number').value, unit: input('unit').value });
  const setValue = (name: string, value: string) => { if (input(name).value !== value) input(name).value = value; };
  const renderValue = (name: string, value: string) => {
    // Native autofill may not emit input. Only a changed model value is authoritative;
    // unrelated cart/shipping publications must not erase the uncaptured native draft.
    if (renderedValues.has(name) ? renderedValues.get(name) !== value : !!value) setValue(name, value);
    renderedValues.set(name, value);
  };
  const capturePostal = () => {
    const value = input('postal').value;
    if (value !== renderedValues.get('postal')) actions?.setPostalCode(value);
  };
  function resetDraft() {
    for (const name of ['name', 'email', 'phone', 'document', 'street', 'number', 'unit']) { setValue(name, ''); renderedValues.set(name, ''); }
  }
  const options = (name: string, values: { value: string; label: string }[], placeholder: string) => {
    const select = node<HTMLSelectElement>(name), first = element('option', placeholder); first.value = '';
    select.replaceChildren(first);
    for (const value of values) { const option = element('option', value.label); option.value = value.value; select.append(option); }
  };
  function bind(next: Actions) {
    if (actions) throw new Error('Checkout view already bound');
    actions = next;
    const method = root.querySelector<HTMLInputElement>('[data-checkout-payment]');
    if (method) listen(method, 'change', () => actions?.selectPayment?.(method.checked ? 'mercadopago' : ''));
    listen(button('new-order'), 'click', () => { if (!button('new-order').disabled && actions?.startNewOrder?.()) { resetDraft(); input('name').focus(); } });
    listen(button('payment-start'), 'click', () => { if (!button('payment-start').disabled) actions?.startPayment?.(); });
    listen(button('payment-refresh'), 'click', () => { if (!button('payment-refresh').disabled) actions?.refreshPayment?.(); });
    for (const name of ['name', 'email', 'phone', 'document']) listen(input(name), 'input', () => { actions?.setContact(contact()); });
    for (const name of ['street', 'number', 'unit']) listen(input(name), 'input', () => { actions?.setAddress(address()); });
    listen(node('form'), 'change', () => { actions?.setContact(contact()); actions?.setAddress(address()); });
    listen(input('postal'), 'input', () => { actions?.setPostalCode(input('postal').value); });
    listen(node('candidates'), 'change', () => { actions?.selectDestination(node<HTMLSelectElement>('candidates').value); });
    listen(node('point'), 'change', () => { actions?.selectPoint(node<HTMLSelectElement>('point').value); });
    for (const [name, action] of [['lookup', 'findDestination'], ['quote', 'requestQuote'], ['retry', 'retryAttempt'], ['check', 'checkPending'], ['reset', 'discardSession']] as const) {
      listen(button(name), 'click', () => {
        if (button(name).disabled) return;
        if (name === 'lookup' || name === 'quote') capturePostal();
        actions?.[action]();
      });
    }
    listen(node('form'), 'submit', event => {
      event.preventDefault();
      if (button('submit').disabled || !node<HTMLFormElement>('form').reportValidity()) return;
      // Browser autofill can change values without dispatching input events.
      const currentContact = contact(), currentAddress = address();
      capturePostal();
      actions?.setContact(currentContact); actions?.setAddress(currentAddress); actions?.placeOrder();
    });
  }
  function render(state: CheckoutSnapshot, shipping: ShippingSnapshot, cart: CartView) {
    const locked = state.locked || !state.loaded;
    button('new-order').hidden = !canStartNewOrder(state);
    button('new-order').disabled = !canStartNewOrder(state);
    for (const [name, value] of Object.entries({ ...state.contact, ...state.address })) renderValue(name, value);
    renderValue('postal', shipping.postalCode);
    node<HTMLFieldSetElement>('fields').disabled = locked;
    const paid = state.order?.paymentStatus === 'approved' && state.order.orderStatus !== 'cancelled' && state.payment?.status !== 'review';
    node('form').hidden = state.order ? paid || !state.order.paymentAvailable : !cart.ready || !cart.items.length;
    node('loading').hidden = !!state.order || cart.ready;
    node('empty').hidden = !!state.order || !cart.ready || !!cart.items.length;
    node('error-box').hidden = !state.error; node('error').textContent = state.error;
    node('pending').hidden = !state.pending || !!state.order;
    button('retry').hidden = !state.canRetry; button('check').hidden = state.canRetry;
    for (const name of ['retry', 'check']) { button(name).disabled = state.sending; }
    button('retry').textContent = state.sending ? 'Consultando…' : 'Reintentar el mismo intento';
    button('check').textContent = state.sending ? 'Consultando…' : 'Consultar estado del intento';
    const showReset = state.invalidSession && !state.pending && !state.order;
    node('reset-box').hidden = !showReset; button('reset').hidden = !showReset || !recoveryAvailable();
    button('reset').disabled = state.quoteBusy; node('reset-unavailable').hidden = !showReset || recoveryAvailable();
    node('order').hidden = !state.order;
    node('order').className = paid ? 'checkout-section checkout-success' : 'checkout-section';
    node('order-reference').textContent = state.order ? `Referencia: ${state.order.id}` : '';
    node('order-total').textContent = state.order ? `Total: ${formatPrice(BigInt(state.order.totalMinor), state.order.currency)}` : '';
    const paymentStatus = state.payment?.status ?? state.order?.paymentStatus ?? 'not_started';
    const labels: Record<string, string> = { not_started: 'No iniciado', pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado', partially_refunded: 'Reembolso parcial', in_mediation: 'En disputa', refunded: 'Reembolsado', charged_back: 'Contracargo' };
    const shippingLabels: Record<string, string> = { not_started: 'No iniciado', ready_to_ship: 'Listo para despachar', shipped: 'En camino', delivered: 'Entregado', returned: 'Devuelto' };
    node('order-payment-status').textContent = `Pago: ${labels[state.order?.paymentStatus ?? 'not_started']}. Envío: ${shippingLabels[state.order?.shippingStatus ?? 'not_started']}.`;
    node('payment-box').hidden = !state.order?.paymentAvailable;
    const orderMode = root.querySelector<HTMLElement>('[data-checkout-order-mode]');
    if (orderMode) orderMode.textContent = state.order?.testLocal ? 'PEDIDO DE PRUEBA' : 'ESTADO DEL PAGO';
    const orderTitle = root.querySelector<HTMLElement>('[data-checkout-order-title]');
    if (orderTitle) orderTitle.textContent = paid ? state.order?.orderStatus === 'cancelled' ? 'Pago recibido; pedido en revisión' : 'Pago aprobado' : paymentStatus === 'pending' ? 'Pago pendiente de confirmación' : paymentStatus === 'expired' ? 'La reserva venció' : 'Continuar tu compra';
    const paymentHelp = root.querySelector<HTMLElement>('[data-checkout-payment-help]');
    if (paymentHelp) paymentHelp.textContent = state.order?.testLocal ? 'Usá únicamente cuentas y tarjetas de prueba.' : 'Al volver de Mercado Pago verificaremos el resultado de tu pago.';
    node('payment-message').textContent = paymentStatus === 'uncertain' ? 'El resultado es incierto. Consultá el estado antes de volver a pagar; conservamos tu pedido.' : paymentStatus === 'ready' ? 'Tu pedido está guardado. Podés continuar el pago en Mercado Pago.' : paymentStatus === 'expired' ? 'La reserva venció. Iniciá otra compra para actualizar precios, envío y disponibilidad.' : paymentStatus === 'disabled' ? 'El pago no está disponible.' : paymentStatus === 'not_started' ? 'Tus datos están guardados. Podés reintentar el pago con este pedido.' : paymentStatus === 'rejected' || paymentStatus === 'cancelled' ? 'El pago no se completó. Podés reintentar con este mismo pedido.' : `Resultado verificado por el servidor: ${labels[paymentStatus] ?? 'No disponible'}.`;
    button('payment-start').hidden = !['not_started', 'rejected', 'cancelled'].includes(paymentStatus) || state.order?.orderStatus === 'cancelled';
    if (paymentStatus === 'review') {
      if (orderTitle) orderTitle.textContent = 'Necesitamos revisar tu pago';
      node('order-payment-status').textContent = 'Hay un movimiento de pago sobre un pedido cancelado.';
      node('payment-message').textContent = 'Contactá a la tienda con esta referencia para resolverlo. No vuelvas a pagar este pedido.';
    }
    button('payment-start').disabled = state.sending;
    button('payment-refresh').disabled = state.sending;
    const link = node<HTMLAnchorElement>('payment-link');
    link.hidden = state.payment?.status !== 'ready' || state.sending;
    if (state.payment?.status === 'ready' && !state.sending) link.href = state.payment.url;
    else link.removeAttribute('href');
    if (state.paymentFocus && state.paymentFocus !== focusedPayment && !link.hidden) { focusedPayment = state.paymentFocus; link.focus(); }
    if (state.order && state.order.id !== focusedOrder) { focusedOrder = state.order.id; node('order').focus(); }
    const candidates = ['resolved', 'ambiguous'].includes(shipping.lookup.status) ? shipping.lookup.candidates : [];
    const nextCandidates = JSON.stringify(candidates);
    if (nextCandidates !== candidateKey) { candidateKey = nextCandidates; options('candidates', candidates.map(value => ({ value: value.id, label: value.label })), 'Elegí una localidad'); }
    node('candidates-box').hidden = !candidates.length;
    node<HTMLSelectElement>('candidates').value = candidates.some(value => value.id === shipping.candidateId) ? shipping.candidateId! : '';
    const messages: Record<string, string> = {
      invalid: 'El código postal no es válido.', not_found: 'No encontramos localidades para este código postal.',
      too_many: 'Hay demasiadas localidades para este código postal.', unavailable: 'La consulta de localidades no está disponible. Intentá nuevamente.',
      needs_lookup: 'Volvé a buscar la localidad para continuar.', loading: 'Buscando localidades…',
    };
    node('destination-message').textContent = state.order?.checkout?.delivery ?? messages[shipping.lookup.status] ?? '';
    const deliveryDisabled = locked || cart.unresolved;
    input('postal').disabled = deliveryDisabled; node<HTMLSelectElement>('candidates').disabled = deliveryDisabled;
    // Keep explicit lookup reachable after eventless autofill; ShippingSession validates before HTTP.
    button('lookup').disabled = deliveryDisabled || shipping.lookup.status === 'loading';
    button('quote').disabled = deliveryDisabled || state.quoteBusy || !candidates.some(value => value.id === shipping.candidateId);
    button('quote').textContent = state.quoteBusy ? 'Consultando…' : 'Consultar opciones';
    node('delivery').setAttribute('aria-busy', String(state.quoteBusy || shipping.lookup.status === 'loading'));
    const validQuote = !state.expired && state.quote && Date.now() < state.quote.validUntil ? state.quote : null;
    const nextOptions = JSON.stringify(validQuote);
    if (nextOptions !== optionKey) {
      optionKey = nextOptions; clearRadios(); node('options').replaceChildren();
      for (const value of validQuote?.options ?? []) {
        const label = element('label'); label.className = 'checkout-choice';
        const radio = element('input'); radio.type = 'radio'; radio.name = 'delivery'; radio.value = value.id;
        label.append(radio, element('span', `${value.carrierName} · ${value.serviceName} · ${formatPrice(BigInt(value.amountMinor), value.currency)}`));
        listen(radio, 'change', () => { if (!radio.disabled) actions?.selectOption(value.id); }, radioListeners); node('options').append(label);
      }
    }
    Array.from(node('options').children).forEach(label => {
      const radio = label.children[0] as HTMLInputElement; radio.checked = radio.value === state.option; radio.disabled = deliveryDisabled;
    });
    node('options-box').hidden = !validQuote;
    const selected = validQuote?.options.find(value => value.id === state.option), points = selected?.pickupPoints;
    const nextPoints = JSON.stringify([selected?.id, points]);
    if (nextPoints !== pointKey) { pointKey = nextPoints; options('point', (points ?? []).map(value => ({ value: String(value.id), label: value.description })), 'Elegí un punto de retiro'); }
    node('point-box').hidden = !points; node<HTMLSelectElement>('point').value = state.point; node<HTMLSelectElement>('point').disabled = deliveryDisabled;
    node('expired').hidden = !state.expired;
    const keys = new Set(cart.items.map(pairKey));
    let removedFocus = false;
    for (const [key, row] of rows) if (!keys.has(key)) { removedFocus ||= row.root.contains(root.ownerDocument.activeElement); row.dispose(); row.root.remove(); rows.delete(key); }
    cart.items.forEach((item, index) => {
      const key = pairKey(item); let row = rows.get(key);
      if (!row) { row = checkoutLine(root.ownerDocument, (current, difference) => actions?.changeQuantity?.(current.productId, current.variantId, difference)); rows.set(key, row); }
      row.update(item, locked, cart.unresolved);
      if (node('lines').children[index] !== row.root) node('lines').insertBefore(row.root, node('lines').children[index] ?? null);
    });
    if (removedFocus) { if (rows.size) rows.values().next().value?.focus(); else node('empty').focus(); }
    if (!warningNode) { warningNode = element('p'); warningNode.className = 'checkout-bulk-warning'; warningNode.setAttribute('role', 'status'); node('lines').after(warningNode); }
    warningNode.textContent = [cart.mutationError, cart.stockShortage ? 'La cantidad supera el stock disponible. Reduzca las unidades o elimine el artículo.' : '', ...bulkWarnings(cart.items).map(warning => warning.text)].filter(Boolean).join(' ');
    warningNode.hidden = !!state.order || !warningNode.textContent;
    node('unresolved').hidden = !cart.unresolved;
    const nextTotals = JSON.stringify(Object.entries(cart.totals).map(([currency, value]) => [currency, value.toString()]).sort());
    if (nextTotals !== totalsKey) {
      totalsKey = nextTotals; node('totals').replaceChildren();
      for (const [currency, value] of Object.entries(cart.totals)) node('totals').append(element('dt', `Subtotal (${currency})`), element('dd', formatPrice(value, currency)));
    }
    node('totals').hidden = cart.unresolved;
    const pickupReady = !points || points.some(point => String(point.id) === state.point), currencies = Object.keys(cart.totals);
    const shippingIncluded = !!selected && pickupReady && currencies.length === 1 && currencies[0] === selected.currency && !cart.unresolved;
    node('shipping-total').textContent = shippingIncluded ? `Entrega: ${formatPrice(BigInt(selected!.amountMinor), selected!.currency)}` : '';
    node('grand-total').textContent = shippingIncluded ? `Total estimado: ${formatPrice(cart.totals[selected!.currency] + BigInt(selected!.amountMinor), selected!.currency)}` : '';
    node('total-message').textContent = selected && !shippingIncluded && !cart.unresolved ? !pickupReady ? 'Elegí un punto de retiro para calcular el total.' : 'No se puede sumar el envío a los subtotales en distintas monedas.' : '';
    const method = root.querySelector<HTMLInputElement>('[data-checkout-payment]');
    if (method) { method.checked = state.paymentMethod === 'mercadopago'; method.disabled = locked || root.dataset.paymentAvailable !== 'true'; }
    const complete = [input('name').value, input('phone').value, input('street').value, input('number').value].every(v => !!v.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input('email').value) && (!input('document').value || /^(?:[0-9]{7,8}|[0-9]{11})$/.test(input('document').value));
    button('submit').disabled = locked || !cart.ready || !cart.items.length || !shippingIncluded || !validQuote || state.quoteBusy || !complete || (!!method && state.paymentMethod !== 'mercadopago');
    button('submit').hidden = !!state.order;
    button('submit').textContent = state.sending ? 'Procesando…' : shippingIncluded ? `Pagar ${formatPrice(cart.totals[selected!.currency] + BigInt(selected!.amountMinor), selected!.currency)}` : 'Pagar';
    if (root.dataset?.newOrdersEnabled === 'false' || root.dataset?.paymentAvailable === 'false') { button('submit').disabled = true; button('quote').disabled = true; }
    const savedLines = root.querySelector<HTMLElement>('[data-checkout-confirmed-lines]'), editCart = root.querySelector<HTMLElement>('[data-checkout-edit-cart]');
    if (editCart) editCart.hidden = !!state.order;
    if (savedLines) {
      savedLines.hidden = !state.order?.checkout;
      const key = JSON.stringify(state.order?.checkout?.lines);
      if (key !== confirmedLinesKey) { confirmedLinesKey = key; savedLines.replaceChildren(...(state.order?.checkout?.lines ?? []).map(line => element('li', `${line.quantity} × ${line.name} · ${line.variantName} — ${formatPrice(BigInt(line.lineTotalMinor), line.currency)}`))); }
    }
    node('lines').hidden = !!state.order;
    if (state.order) {
      node('totals').hidden = true; node('unresolved').hidden = true; node('shipping-total').textContent = state.order.checkout?.delivery ?? ''; node('total-message').textContent = '';
      node('grand-total').textContent = `Total: ${formatPrice(BigInt(state.order.totalMinor), state.order.currency)}`;
      node('expired').hidden = true; button('quote').hidden = true; node('options-box').hidden = true; node('point-box').hidden = true;
    } else button('quote').hidden = false;
    if (state.focusRequest && state.focusRequest !== focused) {
      focused = state.focusRequest;
      if (state.error) node('error').focus(); else if (state.pending) node('pending').focus();
    }
  }
  return { bind, render, resetDraft, dispose() { actions = undefined; resetDraft(); clearRadios(); for (const row of rows.values()) row.dispose(); rows.clear(); warningNode?.remove(); for (const remove of listeners.splice(0)) remove(); } };
}
