import { formatPrice } from '../lib/cart';
import type { CartState } from '../hooks/useCart';

export function CartSummary({ totals, unresolved }: Pick<CartState, 'totals' | 'unresolved'>) {
  const entries = Object.entries(totals);
  return <section className="cart-summary" aria-label="Resumen del carrito">
    <h2>Resumen</h2>
    {unresolved && <p className="cart-summary-note">Subtotal parcial: faltan artículos por verificar.</p>}
    <dl aria-live="polite">
      {entries.length ? entries.map(([currency, amount]) => <div key={currency}><dt>Subtotal {currency}</dt><dd>{formatPrice(amount, currency)}</dd></div>) : <div><dt>Subtotal</dt><dd>Pendiente</dd></div>}
      <div><dt>Envío</dt><dd>A calcular</dd></div>
    </dl>
    <p className="fine-print">El pago todavía no está disponible.</p>
  </section>;
}
