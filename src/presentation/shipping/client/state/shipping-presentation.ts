import type { CartView } from '../../../cart/client/state/cart-snapshot';
import { cheapestShipping, invalidPostalCode, selectedShippingTotal } from '../../../shared/shipping/shipping-client';
import { shippingCartKey, type ShippingSnapshot } from '../../../shared/shipping/shipping-session';

type Cart = Pick<CartView, 'items' | 'totals' | 'unresolved'>;
type Mode = 'api' | 'demo';

/** Same identity as the React adapter, including exact sorted monetary totals. */
export function cartShippingIdentity(cart: Cart, mode: Mode) {
  const lines = cart.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
  const totalsKey = JSON.stringify(Object.entries(cart.totals).map(([currency, value]) => [currency, value.toString()]).sort());
  return { lines, totalsKey, key: shippingCartKey(mode, lines, cart.unresolved, totalsKey) };
}

/** Projection only: never guess locality, select a pickup point, or extend quote expiry. */
export function shippingPanelState(cart: Cart, mode: Mode, snapshot: ShippingSnapshot) {
  const coherent = snapshot.cartKey === cartShippingIdentity(cart, mode).key;
  const eligible = mode === 'api' && coherent && !cart.unresolved && cart.items.length > 0;
  const expired = snapshot.expired || (snapshot.quote?.status === 'quoted' && snapshot.quote.validUntil <= Date.now());
  const quote = eligible && !expired ? snapshot.quote : null;
  const automatic = cheapestShipping(quote, cart.totals);
  const candidate = eligible && !expired ? snapshot.selection?.shipping ?? automatic?.shipping ?? null : null;
  const shipping = candidate && candidate.validUntil > Date.now() ? candidate : null;
  const total = selectedShippingTotal(cart.totals, shipping);
  const invalid = invalidPostalCode(snapshot.postalCode);
  const showCandidates = mode === 'api' && coherent && snapshot.lookup.status === 'ambiguous';
  const retry = mode === 'api' && coherent && !!(snapshot.error || expired || ['unavailable', 'needs_lookup'].includes(snapshot.lookup.status) || quote?.status === 'unavailable');
  const busy = eligible && !snapshot.error && !expired && !quote && /^\d{4}$/.test(snapshot.postalCode.trim()) &&
    (['idle', 'loading'].includes(snapshot.lookup.status) || snapshot.loading || (snapshot.estimateEnabled && !!snapshot.candidateId));
  const currencies = Object.keys(cart.totals);
  const choices = quote?.status === 'quoted' && currencies.length === 1 && !snapshot.error && !snapshot.loading
    ? quote.options.map((option, index) => ({ option, index })).filter(({ option }) => option.currency === currencies[0]) : [];
  const choiceKey = choices.length ? snapshot.selection?.choiceKey ?? automatic?.choiceKey ?? null : null;
  const canCalculate = eligible && !busy && !snapshot.loading && snapshot.lookup.status !== 'loading' && /^\d{4}$/.test(snapshot.postalCode.trim());
  let message = 'Ingresá tu código postal para calcular el envío.';
  if (mode === 'demo') message = 'El cálculo no está disponible en el modo de demostración.';
  else if (!cart.items.length) message = 'Agregá artículos para calcular el envío.';
  else if (cart.unresolved || !coherent) message = 'Esperá a que se verifiquen los artículos del carrito.';
  else if (invalid) message = 'Ingresá los cuatro números de tu código postal.';
  else if (expired) message = 'La cotización venció. Volvé a calcular el envío.';
  else if (snapshot.error) message = 'No se pudo consultar el envío. Intentá más tarde.';
  else if (quote?.status === 'unavailable' && quote.reason === 'LOGISTICS_UNAVAILABLE') message = 'Faltan el peso o las medidas de algún producto para calcular el envío.';
  else if (quote?.status === 'unavailable') message = quote.reason === 'NO_OPTIONS' ? 'No hay opciones disponibles para este destino.' : 'El cálculo de envío no está disponible por el momento.';
  else if (snapshot.lookup.status === 'not_found') message = 'No encontramos localidades para ese código postal.';
  else if (snapshot.lookup.status === 'too_many') message = 'Hay demasiadas localidades para este código. No podemos calcular el envío por ahora.';
  else if (snapshot.lookup.status === 'unavailable') message = 'No pudimos consultar las localidades en este momento.';
  else if (snapshot.lookup.status === 'needs_lookup') message = 'Volvé a buscar la localidad para continuar.';
  else if (busy) message = snapshot.candidateId ? 'Calculando envío…' : 'Buscando localidades…';
  else if (automatic?.requiresPickup && !snapshot.selection) message = 'El envío estimado requiere elegir una sucursal antes de confirmar la entrega.';
  else if (showCandidates && !snapshot.candidateId) message = 'Este código corresponde a varias localidades. Elegí la tuya.';
  else if (snapshot.candidateId) {
    const selected = snapshot.lookup.candidates.find(candidate => candidate.id === snapshot.candidateId);
    if (selected) message = `Destino: ${selected.label}`;
  }
  return { coherent, invalid, showCandidates, retry, busy, message, shipping, total, choices, choiceKey, canCalculate };
}
