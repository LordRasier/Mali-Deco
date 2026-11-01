'use client';

import { useEffect } from 'react';
import type { CartState } from '../hooks/useCart';
import { shippingCartKey } from '../lib/shipping-session';
import { CartSummary } from './CartSummary';
import { ShippingEstimate } from './ShippingEstimate';
import { useShipping } from './ShippingProvider';

/** Shared summary and quote controls for the drawer and full cart page. */
export function CartQuoteBlock({ cart, mode }: { cart:CartState; mode:'api'|'demo' }) {
  const {session,snapshot}=useShipping();
  const lines=cart.items.map(({productId,variantId,quantity}) => ({productId,variantId,quantity}));
  const totalsKey=JSON.stringify(Object.entries(cart.totals).map(([currency,amount]) => [currency,amount.toString()]).sort());
  const key=shippingCartKey(mode,lines,cart.unresolved,totalsKey);
  useEffect(() => { session.syncCart(mode,lines,cart.unresolved,totalsKey); },[session,key]);
  const coherent=snapshot.cartKey === key;
  return <><CartSummary totals={cart.totals} unresolved={cart.unresolved} shipping={coherent ? snapshot.selection?.shipping ?? null : null} /><ShippingEstimate mode={mode} coherent={coherent} unresolved={cart.unresolved} /></>;
}
