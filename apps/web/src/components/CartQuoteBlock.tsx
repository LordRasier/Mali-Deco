'use client';

import { useEffect } from 'react';
import type { CartState } from '../hooks/useCart';
import { shippingCartKey } from '../lib/shipping-session';
import { cheapestShipping } from '../lib/shipping-client';
import { CartSummary } from './CartSummary';
import { ShippingEstimate } from './ShippingEstimate';
import { useShipping } from './ShippingProvider';

/** Shared summary and quote controls for the drawer and full cart page. */
export function CartQuoteBlock({ cart, mode, compact = false }: { cart:CartState; mode:'api'|'demo'; compact?:boolean }) {
  const {session,snapshot}=useShipping();
  const lines=cart.items.map(({productId,variantId,quantity}) => ({productId,variantId,quantity}));
  const totalsKey=JSON.stringify(Object.entries(cart.totals).map(([currency,amount]) => [currency,amount.toString()]).sort());
  const key=shippingCartKey(mode,lines,cart.unresolved,totalsKey);
  useEffect(() => { session.syncCart(mode,lines,cart.unresolved,totalsKey); },[session,key]);
  const coherent=snapshot.cartKey === key;
  const automatic=coherent && !cart.unresolved ? cheapestShipping(snapshot.quote,cart.totals) : null;
  const shipping=coherent ? snapshot.selection?.shipping ?? automatic?.shipping ?? null : null;
  const estimate=<ShippingEstimate mode={mode} coherent={coherent} unresolved={cart.unresolved} compact={compact} automatic={automatic} />;
  const summary=<CartSummary totals={cart.totals} unresolved={cart.unresolved} shipping={shipping} compact={compact} />;
  return compact ? <>{estimate}{summary}</> : <>{summary}{estimate}</>;
}
