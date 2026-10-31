import type { CartState } from '../hooks/useCart';

export function CartNotices({ cart }: { cart: CartState }) {
  return <>
    {cart.removedNotice > 0 && <p className="cart-notice" role="status">Algunos artículos guardados no pudieron recuperarse y se quitaron del carrito.</p>}
    {cart.storageUnavailable && <p className="cart-notice" role="status">{cart.storageTabOnly ? 'Este carrito se guarda solo en esta pestaña; no se sincroniza con otras.' : 'No pudimos guardar el carrito en este navegador. Se conservará solo mientras esta página esté abierta.'}</p>}
    {cart.status === 'error' && <p className="cart-notice" role="alert">No pudimos verificar todo el carrito. Conservamos tus artículos. <button type="button" className="inline-link" onClick={cart.retry}>Reintentar</button></p>}
    {cart.status === 'loading' && <p className="cart-notice" role="status">Verificando artículos…</p>}
  </>;
}
