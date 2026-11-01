'use client';

import type { CartState } from '../hooks/useCart';
import Link from 'next/link';
import { cartCountLabel } from '../lib/cart';
import { CartItems } from './CartItems';
import { CartNotices } from './CartNotices';
import { CartQuoteBlock } from './CartQuoteBlock';
import { Dialog } from './Dialog';
import { Icon } from './Icons';

export function CartDialog({ open, onClose, cart, demo }: { open: boolean; onClose: () => void; cart: CartState; demo: boolean }) {
  return <Dialog open={open} onClose={onClose} label="Tu carrito" className="cart-dialog">
    <div className="cart-drawer">
      <header className="cart-header">
        <div><span className="eyebrow">TUS ELEGIDOS</span><h2>Tu carrito</h2>{cart.ready && <p>{cartCountLabel(cart.items.length, cart.count)}</p>}</div>
        <button className="cart-close" type="button" onClick={onClose} aria-label="Cerrar carrito"><Icon name="close" /></button>
      </header>
      <div className="cart-drawer-body"><CartNotices cart={cart} /><CartItems cart={cart} demo={demo} />{cart.ready && cart.items.length > 0 && <div className="cart-drawer-quote"><CartQuoteBlock cart={cart} mode={demo ? 'demo' : 'api'} /></div>}</div>
      {cart.ready && cart.items.length > 0 && <div className="cart-drawer-footer">
        <Link className="button primary cart-full-link" href="/carrito">Ver carrito <Icon name="arrow" /></Link>
        <a className="cart-continue" href="/catalogo">Seguir comprando</a>
      </div>}
    </div>
  </Dialog>;
}
