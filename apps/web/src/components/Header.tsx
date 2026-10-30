'use client';

import { useState } from 'react';
import { Icon } from './Icons';

export function Header({ brand, demo, count, query, onQuery, onCartOpen }: {
  brand: string;
  demo: boolean;
  count: number;
  query: string;
  onQuery: (value: string) => void;
  onCartOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      {demo && (
        <div className="demo-notice">
          Vista de demostración · Imágenes generadas y precios de ejemplo
        </div>
      )}
      <header className={`site-header ${demo ? 'with-notice' : ''}`}>
        <a className="brand" href="#inicio">{brand}</a>
        <nav id="main-nav" className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="Navegación principal">
          <a href="#objetos" onClick={() => setMenuOpen(false)}>Objetos</a>
          <a href="#coleccion" onClick={() => setMenuOpen(false)}>Colecciones</a>
          <a href="#historia" onClick={() => setMenuOpen(false)}>Cómo lo hacemos</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" aria-label={searchOpen ? 'Cerrar búsqueda' : 'Buscar'} aria-expanded={searchOpen} aria-controls="store-search" onClick={() => { if (searchOpen) onQuery(''); setSearchOpen(!searchOpen); setMenuOpen(false); }}>
            <Icon name="search" />
          </button>
          <button className="icon-button bag-button" aria-label={`Abrir carrito, ${count} productos`} onClick={onCartOpen}>
            <Icon name="bag" />
            {count > 0 && <span>{count}</span>}
          </button>
          <button className="icon-button menu-button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => { setMenuOpen(!menuOpen); if (searchOpen) onQuery(''); setSearchOpen(false); }}>
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </div>
        {searchOpen && (
          <form id="store-search" className="search-form" onSubmit={event => {
            event.preventDefault();
            document.querySelector('#objetos')?.scrollIntoView();
          }}>
            <label htmlFor="search">Buscar objetos</label>
            <div>
              <input id="search" value={query} onChange={event => onQuery(event.target.value)} placeholder="¿Qué estás buscando?" />
              <button type="submit">Buscar <Icon name="arrow" /></button>
            </div>
          </form>
        )}
      </header>
    </>
  );
}
