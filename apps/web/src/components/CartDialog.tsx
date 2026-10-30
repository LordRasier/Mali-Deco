'use client';

import { formatPrice, resolveCart } from '../lib/cart';
import type { StorefrontData } from '../lib/storefront-types';
import { Dialog } from './Dialog';
import { Icon } from './Icons';

type CartDialogProps = {
  open: boolean;
  onClose: () => void;
  items: ReturnType<typeof resolveCart>;
  count: number;
  totals: Record<string, bigint>;
  removedNotice: number;
  mode: StorefrontData['mode'];
  onAdjust: (productId: string, variantId: string, difference: number) => void;
};

export function CartDialog({ open, onClose, items, count, totals, mode, onAdjust, removedNotice }: CartDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} label="Tu carrito" className="cart-dialog">
      <div className="cart-inner">
        <div className="cart-header">
          <div>
            <span className="eyebrow">TUS ELEGIDOS</span>
            <h2>Tu carrito <span>({count})</span></h2>
          </div>
          <button className="dialog-close static" onClick={onClose} aria-label="Cerrar carrito">
            <Icon name="close" />
          </button>
        </div>
        {removedNotice > 0 && <p className="cart-notice" role="status">Algunos artículos guardados no pudieron recuperarse y se quitaron del carrito.</p>}
        {items.length ? (
          <>
            <ul className="cart-list">
              {items.map(line => (
                <li key={`${line.productId}-${line.variantId}`}>
                  {line.product.image ? <img src={line.product.image} alt="" loading="lazy" decoding="async" /> : <div className="cart-placeholder" aria-hidden="true" />}
                  <div>
                    <strong>{line.product.name}</strong>
                    <p>{line.variant.name}</p>
                    <span>
                      {formatPrice(line.variant.priceMinor, line.variant.currency)}{mode === 'demo' && ' · ejemplo'}
                    </span>
                    <div className="quantity">
                      <button
                        aria-label={`Quitar una unidad de ${line.product.name}, ${line.variant.name}`}
                        onClick={() => onAdjust(line.productId, line.variantId, -1)}
                      >
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        aria-label={`Agregar una unidad de ${line.product.name}, ${line.variant.name}`}
                        onClick={() => onAdjust(line.productId, line.variantId, 1)}
                        disabled={line.quantity >= 999}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="cart-total">
              <span>Subtotal</span>
              <strong>{Object.entries(totals).map(([currency, amount]) => <span key={currency}>{formatPrice(amount, currency)}<br /></span>)}</strong>
            </div>
            <p className="fine-print">
              {mode === 'demo' ? 'Precios de ejemplo. ' : ''}El checkout todavía no está disponible.
            </p>
            <button className="button primary add-button" disabled>Finalizar compra</button>
          </>
        ) : (
          <div className="empty-cart">
            <p>Tu carrito está esperando algo especial.</p>
            <button className="button primary" onClick={onClose}>
              Descubrir objetos <Icon name="arrow" />
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
