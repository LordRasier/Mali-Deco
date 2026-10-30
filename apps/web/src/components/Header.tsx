'use client';

import { useState } from 'react';
import { Icon } from './Icons';

export function Header({ brand, demo, count, onCartOpen }: { brand: string; demo: boolean; count: number; onCartOpen: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  return <>
    {demo && <div className="demo-notice">Vista de demostración · Imágenes, categorías y precios de ejemplo</div>}
    <header className={`site-header ${demo ? 'with-notice' : ''}`}>
      <a className="brand" href="/">{brand}</a>
      <nav id="main-nav" className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="Navegación principal">
        <a href="/catalogo">Objetos</a><a href="/#coleccion">Colecciones</a><a href="/#historia">Cómo lo hacemos</a>
      </nav>
      <div className="header-actions">
        <button className="icon-button" aria-label={searchOpen ? 'Cerrar búsqueda' : 'Buscar'} aria-expanded={searchOpen} aria-controls="store-search" onClick={() => { setSearchOpen(!searchOpen); setMenuOpen(false); }}><Icon name="search" /></button>
        <button className="icon-button bag-button" aria-label={`Abrir carrito, ${count} productos`} onClick={onCartOpen}><Icon name="bag" />{count > 0 && <span>{count}</span>}</button>
        <button className="icon-button menu-button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => { setMenuOpen(!menuOpen); setSearchOpen(false); }}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
      </div>
      {searchOpen && <form id="store-search" className="search-form" action="/catalogo" method="get">
        <label htmlFor="header-search">Buscar objetos</label><div><input id="header-search" name="search" maxLength={100} placeholder="¿Qué estás buscando?" /><button type="submit">Buscar <Icon name="arrow" /></button></div>
      </form>}
    </header>
  </>;
}
