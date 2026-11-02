'use client';
import type { CartState } from '../hooks/useCart';
import { formatPrice } from '../lib/cart';
import type { ShippingOption } from '../lib/checkout-client';

type Props = { cart: CartState; selected: ShippingOption | undefined; valid: boolean; pickupReady: boolean; disabled: boolean; sending: boolean };
export function CheckoutSummary({ cart, selected, valid, pickupReady, disabled, sending }: Props) {
  const currencies = Object.keys(cart.totals);
  const shippingIncluded = valid && selected && pickupReady && currencies.length === 1 && currencies[0] === selected.currency && !cart.unresolved;
  return <aside className="checkout-section">
    <h2>Tu carrito</h2>
    <ul className="checkout-summary-lines">{cart.items.map(item => <li key={`${item.productId}:${item.variantId}`}>
      <strong>{item.product?.name ?? 'Artículo pendiente'}</strong>
      <span>{item.variant?.name ?? 'Variante pendiente'} · {item.quantity} unidad{item.quantity === 1 ? '' : 'es'}</span>
      <span>{item.variant ? formatPrice(BigInt(item.variant.priceMinor) * BigInt(item.quantity), item.variant.currency) : 'Precio pendiente'}</span>
    </li>)}</ul>
    {cart.unresolved ? <p>Esperá a que se verifique el carrito.</p> : currencies.map(currency => <p key={currency}>Subtotal ({currency}): <strong>{formatPrice(cart.totals[currency], currency)}</strong></p>)}
    {shippingIncluded && <><p>Entrega: {formatPrice(BigInt(selected.amountMinor), selected.currency)}</p>
      <p>Total estimado: <strong>{formatPrice(cart.totals[selected.currency] + BigInt(selected.amountMinor), selected.currency)}</strong></p></>}
    {valid && selected && !shippingIncluded && !cart.unresolved && <p>{!pickupReady ? 'Elegí un punto de retiro para calcular el total.' : 'No se puede sumar el envío a los subtotales en distintas monedas.'}</p>}
    <p>Los importes son informativos; el servidor confirma el total.</p>
    <button type="submit" disabled={disabled || !shippingIncluded}>{sending ? 'Enviando…' : 'Registrar pedido de prueba'}</button>
  </aside>;
}
