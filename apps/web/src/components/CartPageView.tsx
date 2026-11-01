'use client';

import { useState } from 'react';
import { useCart } from '../hooks/useCart';
import { cartCountLabel } from '../lib/cart';
import type { StorefrontData } from '../lib/storefront-types';
import { CartDialog } from './CartDialog';
import { CartItems } from './CartItems';
import { CartNotices } from './CartNotices';
import { CartQuoteBlock } from './CartQuoteBlock';
import { Header } from './Header';

export default function CartPageView({ mode, brand }: { mode: StorefrontData['mode']; brand: string }) {
  const cart = useCart(mode);
  const [open, setOpen] = useState(false);
  return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <div className="listing-header"><Header brand={brand} demo={mode === 'demo'} count={cart.count} onCartOpen={() => setOpen(true)} /></div>
    <main id="contenido" className="cart-page section-wrap">
      <nav className="breadcrumb" aria-label="Ubicación"><a href="/">Inicio</a> / Carrito</nav>
      <div className="cart-page-heading"><span className="eyebrow">TUS ELEGIDOS</span><h1>Tu carrito.</h1>{cart.ready && <p>{cartCountLabel(cart.items.length, cart.count)}</p>}</div>
      <CartNotices cart={cart} />
      <div className="cart-page-grid"><CartItems cart={cart} demo={mode === 'demo'} />
        {cart.ready && cart.items.length > 0 && <aside className="cart-page-aside"><CartQuoteBlock cart={cart} mode={mode} /><a className="cart-continue" href="/catalogo">← Seguir comprando</a></aside>}
      </div>
    </main>
    <footer><a className="brand" href="/">{brand}</a><p>Diseño, color y objetos para vivir distinto.</p><a href="#contenido">Volver arriba ↑</a></footer>
    <CartDialog open={open} onClose={() => setOpen(false)} cart={cart} demo={mode === 'demo'} />
  </>;
}
