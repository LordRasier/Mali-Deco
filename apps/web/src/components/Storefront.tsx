'use client';

import { useState } from 'react';
import type { StorefrontData } from '../lib/storefront-types';
import { Header } from './Header';
import { Hero } from './Hero';
import { Icon } from './Icons';
import { ProductCard } from './ProductCard';
import { CartDialog } from './CartDialog';
import { useCart } from '../hooks/useCart';

export default function Storefront({ data, fixtureImageId }: { data: StorefrontData; fixtureImageId?: string }) {
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart(data.mode);
  const storyImage = '/storefront/organizador-arco.webp';

  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <Header brand={data.brand} demo={data.mode === 'demo'} count={cart.count} onCartOpen={() => setCartOpen(true)} />
      <main id="contenido">
        <Hero image={data.heroImage} />
        <section className="catalog section-wrap" id="objetos">
          <div className="section-heading">
            <span className="eyebrow">DISEÑO PARA TODOS LOS DÍAS</span>
            <h2>Encontrá tu próximo<br className="mobile-break" /> objeto favorito</h2>
            <p>Piezas con personalidad para espacios con la tuya.</p>
          </div>
          {data.products.length ? (
            <div className="product-grid">
              {data.products.map(item => (
                <ProductCard key={item.id} product={item} demo={data.mode === 'demo'} fixtureImageId={fixtureImageId} />
              ))}
            </div>
          ) : <p className="empty">Todavía no hay objetos publicados.</p>}
        </section>
        <section className="story" id="coleccion">
          <div className="story-image"><img src={storyImage} alt="" loading="lazy" decoding="async" /><span>Imagen ilustrativa</span></div>
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

      <CartDialog open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} demo={data.mode === 'demo'} />
    </>
  );
}
