import * as client from '../../../shared/checkout/checkout-client';
import type { Order, OrderInput, Quote } from '../../../shared/checkout/checkout-client';
import type { ShippingSession } from '../../../shared/shipping/shipping-session';
import { deliveryHintKey, hasDeliveryPreference, restoreDeliveryChoice } from '../../../shared/checkout/checkout-handoff';

export type CheckoutShippingPort = Pick<ShippingSession, 'getSnapshot' | 'subscribe' | 'setEstimateEnabled' | 'syncCart' | 'setPostalCode' | 'selectDestination' | 'lookup' | 'invalidateDestination'>;
export type CheckoutTransport = Pick<typeof client, 'checkoutSession' | 'resetCheckoutSession' | 'checkoutRecoveryAvailable' | 'discardInvalidCheckoutSession' | 'getQuote' | 'createOrder' | 'resumeCheckoutSession' | 'checkOrderAttempt'> & Partial<Pick<typeof client, 'startPayment' | 'refreshPayment'>>;
export type CheckoutRuntime = {
  storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now(): number;
  randomUUID(): string;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
};
export type CheckoutSnapshot = {
  quote: Quote | null; expired: boolean; option: string; point: string;
  quoteBusy: boolean; sending: boolean; error: string; invalidSession: boolean;
  order: Order | null; pending: string | null; loaded: boolean; focusRequest: number;
  contact: OrderInput['contact']; address: OrderInput['address']; canRetry: boolean; locked: boolean;
  payment?: client.PaymentResult;
  paymentFocus?: number;
};
type Line = { productId: string; variantId: string; quantity: number };
export const canStartNewOrder = (state: CheckoutSnapshot) => state.loaded && !state.sending && !!state.order
  && state.payment?.status !== 'uncertain'
  && (!state.order.paymentAvailable || ['approved', 'rejected', 'cancelled', 'partially_refunded', 'refunded', 'charged_back'].includes(state.order.paymentStatus));
const pendingKey = 'checkout-local-pending-v1';
const storageError = 'No está disponible el almacenamiento de sesión. No se puede iniciar un pedido de forma segura.';
const browserRuntime: CheckoutRuntime = {
  storage: () => sessionStorage, now: () => Date.now(), randomUUID: () => crypto.randomUUID(),
  setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Renderer-neutral owner. Start only after mounting; stop retains the opaque pending key,
 * but drops private retry data. Neither mounting nor restarting sends any order request. */
export function createCheckoutStore(shipping: CheckoutShippingPort, options: { runtime?: CheckoutRuntime; transport?: CheckoutTransport } = {}) {
  const runtime = options.runtime ?? browserRuntime, transport = options.transport ?? client;
  const listeners = new Set<() => void>();
  const serverSnapshot: CheckoutSnapshot = {
    quote: null, expired: false, option: '', point: '', quoteBusy: false, sending: false, error: '', invalidSession: false,
    order: null, pending: null, loaded: false, focusRequest: 0, contact: { name: '', email: '', phone: '', document: '' },
    address: { street: '', number: '', unit: '' }, canRetry: false, locked: false,
  };
  let state = serverSnapshot, active = false, disposed = false, generation = 0, revision = 0;
  let paymentFocus = 0;
  let lines: Line[] = [], cartKey = '', cartReady = false, unresolved = true, destination = '';
  let quoteCart: string | null = null, quoteDestination: string | null = null;
  let attempt: OrderInput | null = null, attemptCsrf: string | null = null;
  let expiry: unknown = null, quoteController: AbortController | null = null, resetting = false;
  let unsubscribe: (() => void) | undefined;
  let autoRestoreAttempted = false;
  let editingCart = false;
  let cartPreference: { option: Quote['options'][number]; point: string; destination: string } | null = null;
  const publish = (patch: Partial<CheckoutSnapshot>) => {
    state = { ...state, ...patch };
    state.locked = editingCart || !!state.pending || state.sending || !!state.order;
    for (const listener of listeners) listener();
  };
  const critical = (error: string, patch: Partial<CheckoutSnapshot> = {}) => publish({ error, focusRequest: state.focusRequest + 1, ...patch });
  const current = (epoch: number) => active && generation === epoch;
  const destinationKey = () => {
    const value = shipping.getSnapshot();
    return JSON.stringify([value.mode, value.postalCode.trim(), value.candidateId, value.lookup.status,
      value.lookup.candidates.some(item => item.id === value.candidateId)]);
  };
  const clearExpiry = () => { if (expiry !== null) runtime.clearTimeout(expiry); expiry = null; };
  function clearQuote() {
    revision++; quoteController?.abort(); quoteController = null; clearExpiry(); quoteCart = quoteDestination = null;
  }
  function invalidate() {
    clearQuote();
    publish({ quote: null, option: '', point: '', expired: false, quoteBusy: resetting });
  }
  function expire() {
    clearExpiry();
    if (!active || !state.quote) return;
    const remaining = state.quote.validUntil - runtime.now();
    if (remaining <= 0) { publish({ expired: true }); return; }
    const epoch = generation;
    expiry = runtime.setTimeout(() => { if (current(epoch)) expire(); }, Math.min(remaining, 2147483647));
  }
  function destinationChanged() {
    const next = destinationKey();
    if (next !== destination) { destination = next; cartPreference = null; invalidate(); }
    restoreCartDelivery();
  }
  function syncCart(value: Line[], pending: boolean, ready = true, totalsKey = '') {
    const next = JSON.stringify([value, pending, ready, totalsKey]);
    lines = value.map(line => ({ ...line })); unresolved = pending; cartReady = ready;
    if (next !== cartKey) {
      const selected = !state.locked && state.quote && state.quote.validUntil > runtime.now() ? state.quote.options.find(option => option.id === state.option) : null;
      if (selected) cartPreference = { option: selected, point: state.point, destination: destinationKey() };
      cartKey = next; invalidate();
    }
    if (active && ready) shipping.syncCart('api', lines, pending, totalsKey);
    restoreCartDelivery();
  }
  function beginCartEdit() {
    if (!active || !state.loaded || state.locked || resetting) return false;
    const selected = state.quote?.options.find(option => option.id === state.option);
    if (selected) cartPreference = { option: selected, point: state.point, destination: destinationKey() };
    editingCart = true; invalidate(); return true;
  }
  function endCartEdit() { editingCart = false; if (active) { publish({}); restoreCartDelivery(); } }
  function restoreCartDelivery() {
    const target = shipping.getSnapshot();
    if ((autoRestoreAttempted && !cartPreference) || !active || !state.loaded || state.locked || state.quoteBusy || state.quote || !cartReady || unresolved || !lines.length
      || target.mode !== 'api' || !['resolved', 'ambiguous'].includes(target.lookup.status) || !target.candidateId
      || !target.lookup.candidates.some(item => item.id === target.candidateId)) return;
    try {
      if (!cartPreference && !hasDeliveryPreference(runtime.storage().getItem(deliveryHintKey), lines, { postalCode: target.postalCode, candidateId: target.candidateId }, runtime.now())) return;
    } catch { return; }
    autoRestoreAttempted = true;
    void requestQuote();
  }
  async function requestQuote() {
    const target = shipping.getSnapshot();
    if (!active || !state.loaded || state.locked || state.quoteBusy || !cartReady || unresolved || !lines.length
      || target.mode !== 'api' || !['resolved', 'ambiguous'].includes(target.lookup.status)
      || !target.candidateId || !target.lookup.candidates.some(item => item.id === target.candidateId)) return;
    autoRestoreAttempted = true;
    clearQuote();
    const epoch = generation, identity = revision, requestedCart = cartKey, requestedDestination = destinationKey();
    const requestedLines = lines.map(line => ({ ...line }));
    const controller = new AbortController(); quoteController = controller;
    const valid = () => current(epoch) && revision === identity && cartKey === requestedCart && destinationKey() === requestedDestination && !controller.signal.aborted;
    publish({ quote: null, option: '', point: '', expired: false, error: '', invalidSession: false, quoteBusy: true });
    if (!valid()) return;
    try {
      const csrf = await transport.checkoutSession();
      if (!valid()) return;
      const quote = await transport.getQuote(csrf, requestedLines, { postalCode: target.postalCode.trim(), candidateId: target.candidateId }, controller.signal);
      if (!valid()) return;
      quoteCart = requestedCart; quoteDestination = requestedDestination;
      let preference: { option: string; point: string } | null = null;
      try {
        const storage = runtime.storage();
        preference = restoreDeliveryChoice(storage.getItem(deliveryHintKey), requestedLines, { postalCode: target.postalCode, candidateId: target.candidateId }, quote, runtime.now());
        storage.removeItem(deliveryHintKey);
      } catch { /* Preferences are optional; pending-order storage remains separately enforced. */ }
      if (cartPreference && cartPreference.destination === requestedDestination) {
        const previous = cartPreference, matches = quote.options.filter(option => ['carrierName', 'serviceName', 'serviceCode', 'currency'].every(key => option[key as keyof typeof option] === previous.option[key as keyof typeof option]));
        if (matches.length === 1) preference = { option: matches[0].id, point: matches[0].pickupPoints?.some(point => String(point.id) === previous.point) ? previous.point : '' };
      }
      cartPreference = null;
      publish({ quote, ...preference });
      if (valid()) expire();
    } catch (cause) {
      if (!valid()) return;
      cartPreference = null; transport.resetCheckoutSession();
      const stock = cause instanceof client.CheckoutError && cause.code === 'STOCK_UNAVAILABLE';
      const invalid = cause instanceof client.CheckoutError && cause.status === 403 && cause.code === 'CHECKOUT_SESSION_INVALID';
      const conflicting = cause instanceof client.CheckoutError && cause.status === 403 && cause.code === 'CHECKOUT_SESSION_CONFLICT';
      const invalidDestination = cause instanceof client.CheckoutError && cause.status === 400 && cause.code === 'INVALID_DESTINATION';
      if (invalidDestination) shipping.invalidateDestination();
      if (!current(epoch)) return;
      critical(stock ? 'La cantidad supera el stock disponible. Revise el carrito antes de continuar.' : invalidDestination ? 'La localidad necesita verificarse nuevamente. Buscala otra vez para continuar.' : invalid ? 'La sesión de compra ya no está disponible.' : conflicting ? 'El navegador conserva sesiones de compra incompatibles. Si hay un pedido incierto, no elimines datos y consultá al administrador. De lo contrario, eliminá solo las cookies store_checkout desde la configuración del navegador.' : 'No pudimos obtener la cotización. Revisá la sesión y volvé a intentar.', { invalidSession: invalid });
    } finally {
      if (valid()) { quoteController = null; publish({ quoteBusy: false }); }
    }
  }
  // Removal failure must not turn a confirmed result back into an uncertain result.
  function clearAttempt() {
    try { runtime.storage().removeItem(pendingKey); } catch { /* A stale key can only trigger a read-only lookup. */ }
    attempt = null; attemptCsrf = null;
  }
  async function submit(input: OrderInput, key: string) {
    const epoch = generation, previousAttempt = !!attemptCsrf;
    let started = previousAttempt;
    publish({ sending: true, error: '' });
    if (!current(epoch)) return;
    try {
      const csrf = attemptCsrf ?? await transport.checkoutSession();
      if (!current(epoch)) return;
      attemptCsrf = csrf; started = true;
      const order = await transport.createOrder(csrf, key, input);
      if (!current(epoch)) return;
      if (!order.paymentAvailable) clearAttempt();
      else { attempt = null; attemptCsrf = null; }
      publish({ order, pending: order.paymentAvailable ? key : null, canRetry: false });
    } catch (cause) {
      if (!current(epoch)) return;
      const stock = !previousAttempt && cause instanceof client.CheckoutError && cause.status === 409 && cause.code === 'STOCK_UNAVAILABLE';
      const changedQuote = !previousAttempt && cause instanceof client.CheckoutError && cause.status === 409 && cause.code === 'QUOTE_CHANGED';
      if (!started || (!previousAttempt && cause instanceof client.CheckoutError && cause.status === 400) || changedQuote || stock) {
        clearAttempt();
        if (!started) transport.resetCheckoutSession();
        if (changedQuote || stock) { cartPreference = null; invalidate(); }
        if (!current(epoch)) return;
        critical(stock ? 'La cantidad supera el stock disponible. Revise las cantidades y consulte el envío nuevamente.' : changedQuote ? 'La cotización cambió o venció. Consultá las opciones nuevamente.' : !started ? 'No pudimos iniciar la sesión. Intentá nuevamente.' : 'El pedido fue rechazado. Revisá los datos e intentá nuevamente.', { pending: null, canRetry: false });
      } else critical('No pudimos confirmar el resultado del pedido. No inicies otro: reintentá este mismo intento.');
    } finally { if (current(epoch)) publish({ sending: false }); }
  }
  /** Recheck persistence before a new attempt or reset, including changes made by another view. */
  function pendingFromStorage() {
    try {
      const pending = runtime.storage().getItem(pendingKey);
      if (pending) { critical('', { pending, canRetry: false }); return true; }
      return false;
    } catch { critical(storageError); return true; }
  }
  async function placeOrder() {
    if (!active || !state.loaded || state.locked || state.quoteBusy || attempt || !cartReady || unresolved || !lines.length) return;
    const quote = state.quote;
    if (!quote || quoteCart !== cartKey || quoteDestination !== destinationKey() || !state.option) return;
    if (runtime.now() >= quote.validUntil) { invalidate(); critical('La cotización venció. Consultá las opciones nuevamente.'); return; }
    const selected = quote.options.find(item => item.id === state.option);
    if (!selected || (selected.pickupPoints && !selected.pickupPoints.some(item => String(item.id) === state.point))) return;
    if (pendingFromStorage()) return;
    const input: OrderInput = { quoteId: quote.quoteId, optionId: state.option, pickupPointId: selected.pickupPoints ? Number(state.point) : null, contact: { ...state.contact }, address: { ...state.address } };
    let key: string;
    try { key = runtime.randomUUID(); runtime.storage().setItem(pendingKey, key); }
    catch { critical(storageError); return; }
    const epoch = generation;
    attempt = input;
    publish({ pending: key, canRetry: true, sending: true });
    if (current(epoch)) await submit(input, key);
  }
  async function retryAttempt() {
    if (!active || state.sending || resetting || !attempt || !state.pending) return;
    await submit(attempt, state.pending);
  }
  async function checkPending() {
    if (!active || !state.pending || state.sending || resetting) return;
    const epoch = generation, key = state.pending;
    publish({ sending: true, error: '' });
    if (!current(epoch)) return;
    try {
      const csrf = await transport.resumeCheckoutSession();
      if (!current(epoch)) return;
      const result = await transport.checkOrderAttempt(csrf, key);
      if (!current(epoch)) return;
      if (result.status === 'completed') {
        if (!result.order.paymentAvailable) clearAttempt();
        publish({ order: result.order, pending: result.order.paymentAvailable ? key : null, canRetry: false });
      }
      else critical('El resultado todavía no está disponible. El intento sigue pendiente; no inicies otro pedido.');
    } catch {
      if (current(epoch)) critical('No pudimos recuperar el estado con la sesión original. El intento sigue pendiente; consultá al administrador.');
    } finally { if (current(epoch)) publish({ sending: false }); }
  }
  async function discardSession() {
    if (!active || !state.loaded || !state.invalidSession || state.locked || attempt || state.quoteBusy || !transport.checkoutRecoveryAvailable()) return;
    if (pendingFromStorage()) return;
    const epoch = generation;
    resetting = true; invalidate();
    try {
      if (!current(epoch)) return;
      await transport.discardInvalidCheckoutSession();
      if (current(epoch)) critical('Sesión anterior cerrada. Consultá las opciones de entrega nuevamente.', { invalidSession: false });
    } catch { if (current(epoch)) critical('No pudimos cerrar la sesión anterior. Intentá nuevamente.'); }
    finally {
      // Reset changes the browser session and cannot be cancelled. A restarted owner
      // must wait for it, but may not receive the stopped lifecycle's error/result.
      resetting = false;
      if (active) publish({ quoteBusy: false });
    }
  }
  async function paymentAction(kind: 'startPayment' | 'refreshPayment') {
    if (!active || state.sending || !state.order?.paymentAvailable || !state.pending || !transport[kind]) return;
    const epoch = generation, order = state.order;
    publish({ sending: true, error: '' });
    try {
      const csrf = await transport.resumeCheckoutSession();
      if (!current(epoch)) return;
      const payment = await transport[kind]!(csrf, order.id);
      if (!current(epoch)) return;
      const status = payment.status;
      const paymentStatus = status === 'pending' || status === 'approved' || status === 'rejected' || status === 'cancelled' || status === 'partially_refunded' || status === 'in_mediation' || status === 'refunded' || status === 'charged_back' ? status : order.paymentStatus;
      publish({ payment, order: { ...order, paymentStatus }, ...(kind === 'startPayment' && status === 'ready' ? { paymentFocus: ++paymentFocus } : {}) });
    } catch { if (current(epoch)) critical('No se pudo verificar el pago. Conserva este pedido y consulta nuevamente; no crees otro.', kind === 'startPayment' ? { payment: { status: 'uncertain' } } : {}); }
    finally { if (current(epoch)) publish({ sending: false }); }
  }
  function startNewOrder() {
    if (!active || resetting || !canStartNewOrder(state)) return false;
    try {
      const storage = runtime.storage(), stored = storage.getItem(pendingKey);
      if (stored && stored !== state.pending) { critical('Hay otro intento por resolver. Conserva este pedido y consulta al administrador.'); return false; }
      storage.removeItem(pendingKey);
      if (storage.getItem(pendingKey)) throw Error('Recovery key retained');
    } catch { critical(storageError); return false; }
    clearAttempt(); clearQuote(); cartPreference = null; autoRestoreAttempted = false;
    publish({ ...serverSnapshot, payment: undefined, paymentFocus: undefined, loaded: true, focusRequest: state.focusRequest + 1 });
    return true;
  }
  function stop() {
    if (!active) return;
    active = false; const stopped = ++generation; unsubscribe?.(); unsubscribe = undefined;
    attempt = null; attemptCsrf = null; cartPreference = null; editingCart = false; clearQuote();
    shipping.setEstimateEnabled(true);
    if (generation === stopped) publish({ quote: null, option: '', point: '', expired: false, quoteBusy: resetting,
      sending: false, loaded: false, canRetry: false, payment: undefined, paymentFocus: undefined, contact: { ...serverSnapshot.contact }, address: { ...serverSnapshot.address } });
  }
  function start() {
    if (disposed) throw new Error('Checkout store is disposed');
    if (active) throw new Error('Checkout store already started');
    active = true;
    const epoch = ++generation;
    shipping.setEstimateEnabled(false);
    if (!current(epoch)) return () => {};
    destination = destinationKey();
    unsubscribe = shipping.subscribe(() => { if (current(epoch)) destinationChanged(); });
    let pending: string | null = state.pending, error = '';
    try { pending = runtime.storage().getItem(pendingKey) || pending; } catch { error = storageError; }
    publish({ loaded: true, pending, error, quoteBusy: resetting, focusRequest: pending || error ? state.focusRequest + 1 : state.focusRequest });
    restoreCartDelivery();
    return () => { if (current(epoch)) stop(); };
  }
  const editable = () => active && !state.locked && !resetting;
  return {
    start, stop, dispose() { stop(); disposed = true; listeners.clear(); },
    getSnapshot: () => state, getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    syncCart, requestQuote, placeOrder, retryAttempt, checkPending, discardSession, beginCartEdit, endCartEdit, startNewOrder,
    startPayment: () => paymentAction('startPayment'), refreshPayment: () => paymentAction('refreshPayment'),
    setContact(value: OrderInput['contact']) { if (editable()) publish({ contact: { ...value } }); },
    setAddress(value: OrderInput['address']) { if (editable()) publish({ address: { ...value } }); },
    selectOption(option: string) { if (editable()) publish({ option, point: '' }); },
    selectPoint(point: string) { if (editable()) publish({ point }); },
    setPostalCode(value: string) { if (editable()) { invalidate(); shipping.setPostalCode(value); } },
    selectDestination(value: string) { if (editable()) { invalidate(); shipping.selectDestination(value); } },
    findDestination() { if (editable()) { invalidate(); publish({ error: '', invalidSession: false }); if (editable()) void shipping.lookup(); } },
  };
}

export type CheckoutStore = ReturnType<typeof createCheckoutStore>;
