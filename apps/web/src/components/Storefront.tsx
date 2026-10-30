'use client';

import { useState } from 'react';
import type { StorefrontData } from '../lib/storefront-types';
import { Header } from './Header';
import { Hero } from './Hero';
import { Icon } from './Icons';
import { ProductCard } from './ProductCard';
import { ProductDetail } from './ProductDetail';
import { CartDialog } from './CartDialog';
import { useCart } from '../hooks/useCart';
import { useProductDetail } from '../hooks/useProductDetail';

export default function Storefront({ data }: { data: StorefrontData }) {
  const detail = useProductDetail(data.mode);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart(data.mode);
  const storyImage = data.mode === 'demo' ? '/storefront/organizador-arco.webp' : data.products[0]?.image;

  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <Header brand={data.brand} demo={data.mode === 'demo'} count={cart.count} onCartOpen={() => setCartOpen(true)} />
      <main id="contenido">
        <Hero image={data.heroImage} demo={data.mode === 'demo'} />
        <section className="catalog section-wrap" id="objetos">
          <div className="section-heading">
            <span className="eyebrow">DISEÑO PARA TODOS LOS DÍAS</span>
            <h2>Encontrá tu próximo<br className="mobile-break" /> objeto favorito</h2>
            <p>Piezas con personalidad para espacios con la tuya.</p>
          </div>
          {data.products.length ? (
            <div className="product-grid">
              {data.products.map(item => (
                <ProductCard key={item.id} product={item} demo={data.mode === 'demo'} onOpen={() => detail.open(item)} />
              ))}
            </div>
          ) : <p className="empty">Todavía no hay objetos publicados.</p>}
        </section>
        <section className="story" id="coleccion">
          {storyImage && <div className="story-image"><img src={storyImage} alt="" loading="lazy" decoding="async" /></div>}
          <div className="story-copy">
            <span className="eyebrow">UNA NUEVA MIRADA</span>
            <h2>La forma de hacer<br /> espacio a lo distinto.</h2>
            <p>Objetos que combinan diseño, color y textura para transformar los pequeños momentos de todos los días.</p>
            <a className="text-link" href="/catalogo">Explorar la colección <Icon name="arrow" /></a>
          </div>
        </section>
        <section className="about section-wrap" id="historia">
          <span className="eyebrow">DISEÑO EN CADA CAPA</span>
          <h2>Ideas que toman forma.</h2>
          <p>La impresión 3D nos invita a pensar los objetos de otra manera: con curvas, detalles y posibilidades que despiertan la imaginación.</p>
          <a href="/catalogo" className="button outline">Volver a los objetos <Icon name="arrow" /></a>
        </section>
      </main>
      <footer>
        <a className="brand" href="/">{data.brand}</a>
        <p>Diseño, color y objetos para vivir distinto.</p>
        <a href="/">Volver arriba ↑</a>
      </footer>
      <ProductDetail product={detail.state?.product ?? null} preferredId={detail.state?.preferredId} loading={detail.state?.loading} error={detail.state?.error} warning={detail.state?.warning} hasMore={detail.hasMore} onLoadMore={detail.next} onRetry={detail.retry} demo={data.mode === 'demo'} ready={cart.ready} onClose={detail.close} onAdd={(productId, variantId) => {
        if (!cart.ready) return;
        cart.add(productId, variantId);
        detail.close();
        setCartOpen(true);
      }} />
      <CartDialog open={cartOpen} onClose={() => setCartOpen(false)} mode={data.mode} items={cart.items} count={cart.count} totals={cart.totals} onAdjust={cart.adjust} removedNotice={cart.removedNotice} status={cart.status} unresolved={cart.unresolved} onRetry={cart.retry} />
    </>
  );
}
