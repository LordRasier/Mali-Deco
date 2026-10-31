'use client';

import { useEffect, useRef, useState } from 'react';
import { pairKey } from '../lib/cart-resolution';
import type { CartState } from '../hooks/useCart';
import { CartItemRow } from './CartItemRow';

/** Keep keyboard focus in the cart after a requested line disappears. */
export function CartItems({ cart, demo }: { cart: CartState; demo: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<{ key: string; index: number; name: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const lastRemoved = useRef<string | null>(null);
  useEffect(() => {
    if (lastRemoved.current && cart.items.some(item => pairKey(item) === lastRemoved.current)) {
      lastRemoved.current = null; setAnnouncement('');
    }
    const request = pending.current;
    if (!request || cart.items.some(item => pairKey(item) === request.key)) return;
    pending.current = null; lastRemoved.current = request.key;
    setAnnouncement(`${request.name} se quitó del carrito.`);
    const dialog = root.current?.closest('dialog');
    if (dialog && !dialog.open) return;
    const targets = root.current?.querySelectorAll<HTMLElement>('[data-cart-row-focus]');
    (targets?.[Math.min(request.index, (targets?.length ?? 1) - 1)] ?? root.current?.querySelector<HTMLElement>('[data-cart-empty]'))?.focus();
  }, [cart.items]);
  if (!cart.ready) return <p role="status">Cargando carrito…</p>;
  return <div ref={root} className="cart-items">
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {cart.items.length ? <ul className="cart-list">{cart.items.map((item, index) => {
      const remember = () => { setAnnouncement(''); pending.current = { key: pairKey(item), index, name: item.product?.name ?? 'El artículo' }; };
      return <CartItemRow key={pairKey(item)} item={item} position={index + 1} demo={demo}
        onAdjust={difference => { if (difference < 0 && item.quantity === 1) remember(); cart.adjust(item.productId, item.variantId, difference); }}
        onRemove={() => { remember(); cart.remove(item.productId, item.variantId); }} />;
    })}</ul> : <div className="cart-empty"><h2>Tu carrito está vacío.</h2><p>Encontrá un objeto especial para tu espacio.</p><a className="button primary" href="/catalogo" data-cart-empty>Explorar el catálogo</a></div>}
  </div>;
}
