'use client';

import { useState } from 'react';
import { useCart } from '../hooks/useCart';
import { useProductRoute } from '../hooks/useProductRoute';
import { formatPrice } from '../lib/cart';
import type { Product } from '../lib/storefront-types';
import { CartDialog } from './CartDialog';
import { Header } from './Header';
import { Swatches } from './ProductCard';

export default function ProductPageView({ data }: { data: { mode: 'demo' | 'api'; brand: string; product: Product; total: number } }) {
  const cart = useCart(data.mode);
  const detail = useProductRoute(data.product, data.total, data.mode);
  const [cartOpen, setCartOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const selected = detail.selected;
  const shownVariants = selected && !detail.variants.some(item => item.id === selected.id) ? [selected, ...detail.variants] : detail.variants;
  const product = { ...data.product, variants: shownVariants };
  const dimension = (value: number | null | undefined) => value === undefined ? 'No disponible en esta vista' : value === null ? 'No informado' : `${value} mm`;
  return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <div className="listing-header"><Header brand={data.brand} demo={data.mode === 'demo'} count={cart.count} onCartOpen={() => setCartOpen(true)} /></div>
    <main id="contenido" className="product-page section-wrap">
      <nav className="breadcrumb" aria-label="Ubicación"><a href="/">Inicio</a> / <a href="/catalogo">Objetos</a> / {product.name}</nav>
      <div className="product-page-grid">
        <section aria-label="Imágenes del producto" className="product-gallery">
          {product.image && !imageFailed
            ? <img src={product.image} alt={`${product.name}, imagen ${data.mode === 'demo' ? 'de ejemplo' : 'del producto'}`} onError={() => setImageFailed(true)} />
            : <div className="product-gallery-placeholder" role="img" aria-label="Imagen no disponible">Imagen no disponible</div>}
          {data.mode === 'demo' && <p className="fine-print">Imagen generada de ejemplo; no representa necesariamente la variante seleccionada.</p>}
        </section>
        <section className="product-page-copy">
          <p className="eyebrow">OBJETOS CON PERSONALIDAD</p><h1>{product.name}</h1>
          <p className="detail-price">{selected ? formatPrice(selected.priceMinor, selected.currency) : 'Seleccioná una variante'} {data.mode === 'demo' && <small>· precio de ejemplo</small>}</p>
          <p className="product-description">{product.description}</p>
          {product.variants.length > 0 && <><p className="variant-label">Variante: <strong>{selected?.name ?? 'Elegí una opción'}</strong></p>
            <Swatches product={product} selected={selected?.id} onSelect={detail.choose} /></>}
          {!product.variants.length && <p>No hay variantes disponibles.</p>}
          {detail.warning && <p role="alert">{detail.warning}</p>}
          {detail.status === 'loading' && <p role="status">Verificando variante…</p>}
          {detail.status === 'error' && <p role="alert">No pudimos verificar la variante. <button type="button" className="inline-link" onClick={detail.retry}>Reintentar</button></p>}
          {detail.hasMore && !detail.pageConflict && <button type="button" className="inline-link" disabled={detail.loadingMore} onClick={detail.loadMore}>{detail.loadingMore ? 'Cargando variantes…' : 'Mostrar más variantes'}</button>}
          {detail.pageError && <p role="alert">{detail.pageConflict ? <>El catálogo cambió durante la carga. <button type="button" className="inline-link" onClick={() => window.location.reload()}>Reiniciar carga</button></> : <>No pudimos cargar más variantes. <button type="button" className="inline-link" onClick={detail.loadMore}>Reintentar</button></>}</p>}
          <button className="button primary add-button" disabled={!selected || !cart.ready || detail.status !== 'ready' || detail.loadingMore || detail.pageError}
            onClick={() => { if (!selected) return; cart.add(product.id, selected.id); setCartOpen(true); }}>Agregar al carrito ↗</button>
          <div className="product-measurements"><h2>Medidas del producto</h2>
            <p>Ancho: {dimension(product.productWidthMm)} · Alto: {dimension(product.productHeightMm)} · Largo: {dimension(product.productLengthMm)}</p></div>
          <p className="fine-print">El envío y el pago se informarán cuando estén disponibles.</p>
        </section>
      </div>
    </main>
    <footer><a className="brand" href="/">{data.brand}</a><p>Diseño, color y objetos para vivir distinto.</p><a href="#contenido">Volver arriba ↑</a></footer>
    <CartDialog open={cartOpen} onClose={() => setCartOpen(false)} mode={data.mode} items={cart.items} count={cart.count} totals={cart.totals} onAdjust={cart.adjust} removedNotice={cart.removedNotice} status={cart.status} storageUnavailable={cart.storageUnavailable} unresolved={cart.unresolved} onRetry={cart.retry} />
  </>;
}
