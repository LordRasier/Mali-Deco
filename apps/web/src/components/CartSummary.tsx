import { formatPrice } from '../lib/cart';
import type { CartState } from '../hooks/useCart';
import { selectedShippingTotal, type SelectedShipping } from '../lib/shipping-client';

export function CartSummary({ totals, unresolved, shipping = null }: Pick<CartState, 'totals' | 'unresolved'> & { shipping?: SelectedShipping | null }) {
  const entries = Object.entries(totals);
  const current = unresolved ? null : shipping;
  const total = selectedShippingTotal(totals, current);
  return <section className="cart-summary" aria-label="Resumen del carrito">
    <h2>Resumen</h2>
    {unresolved && <p className="cart-summary-note">Subtotal parcial: faltan artículos por verificar.</p>}
    <dl aria-live="polite">
      {entries.length ? entries.map(([currency, amount]) => <div key={currency}><dt>Subtotal {currency}</dt><dd>{formatPrice(amount, currency)}</dd></div>) : <div><dt>Subtotal</dt><dd>Pendiente</dd></div>}
      <div><dt>Envío</dt><dd>{current ? formatPrice(BigInt(current.amountMinor), current.currency) : 'A calcular'}</dd></div>
      {total && <div><dt>Total estimado</dt><dd>{formatPrice(total.amountMinor, total.currency)}</dd></div>}
    </dl>
    {current && !total && <p className="cart-summary-note">No se puede calcular un total con monedas diferentes.</p>}
    <p className="fine-print">El pago todavía no está disponible.</p>
  </section>;
}
