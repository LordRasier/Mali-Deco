'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalogPage, fetchFacets } from '../lib/api-catalog';
import { canMutateCatalog, catalogQueryParams, emptyCatalogQuery, parseCatalogQuery, type CatalogQuery, type CatalogSort } from '../lib/catalog-query';
import { demoFacets, demoListing } from '../lib/demo-listing';
import type { CatalogPage, Facets, StorefrontData } from '../lib/storefront-types';
import { formatPrice } from '../lib/cart';
import { useCart } from '../hooks/useCart';
import { Header } from './Header';
import { Icon } from './Icons';
import { ProductCard } from './ProductCard';
import { CartDialog } from './CartDialog';
import { Dialog } from './Dialog';
import { FilterControls } from './FilterControls';

type Parsed = ReturnType<typeof parseCatalogQuery>;
export default function CatalogListing({ mode, brand }: { mode: StorefrontData['mode']; brand: string }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [pageResultKey, setPageResultKey] = useState('');
  const [facetResultKey, setFacetResultKey] = useState('');
  const pageController = useRef<AbortController | null>(null);
  const facetController = useRef<AbortController | null>(null);
  const [facetStatus, setFacetStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageStatus, setPageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const cart = useCart(mode);
  const query = parsed?.query;
  const canMutate = canMutateCatalog(parsed);
  const queryRef = useRef<CatalogQuery | null>(null);
  const pageKey = query ? `${mode}:${catalogQueryParams(query).toString()}` : '';
  const facetKey = query ? `${mode}:${query.currency}` : '';
  const currentPageStatus = pageResultKey === pageKey ? pageStatus : 'loading';
  const currentFacetStatus = facetResultKey === facetKey ? facetStatus : 'loading';
  const navigate = useCallback((next: CatalogQuery, replace = false) => {
    const params = catalogQueryParams(next).toString();
    const url = `/catalogo${params ? `?${params}` : ''}`;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    pageController.current?.abort();
    if (queryRef.current?.currency !== next.currency) facetController.current?.abort();
    queryRef.current = next; setParsed({ query: next, error: null });
  }, []);
  useEffect(() => {
    const read = () => { const next = parseCatalogQuery(new URLSearchParams(window.location.search)); pageController.current?.abort(); if (next.error) setDrawer(false); if (next.error || queryRef.current?.currency !== next.query.currency) facetController.current?.abort(); queryRef.current = next.query; setParsed(next); };
    read();
    const initial = parseCatalogQuery(new URLSearchParams(window.location.search));
    if (!initial.error && initial.query.search) searchRef.current?.focus();
    window.addEventListener('popstate', read); return () => window.removeEventListener('popstate', read);
  }, []);
  useEffect(() => { if (query) setSearch(query.search); }, [query?.search]);
  useEffect(() => {
    if (!query || parsed?.error) return;
    const controller = new AbortController(); facetController.current = controller; setFacetStatus('loading');
    const request = mode === 'demo' ? Promise.resolve(demoFacets(query.currency)) : fetchFacets('/api/v1/', query.currency, controller.signal);
    request.then(result => {
      if (controller.signal.aborted) return;
      setFacets(result); setFacetResultKey(`${mode}:${query.currency}`); setFacetStatus('ready');
      // Select only a currency actually returned by metadata; never assume ARS for live data.
      if (queryRef.current && !queryRef.current.currency && result.currencies.length) navigate({ ...queryRef.current, currency: result.currencies[0], page: 1 }, true);
    }).catch(() => { if (!controller.signal.aborted) { setFacetResultKey(`${mode}:${query.currency}`); setFacetStatus('error'); } });
    return () => controller.abort();
  }, [mode, query?.currency, parsed?.error, retry]);
  useEffect(() => {
    if (!query || parsed?.error) return;
    const controller = new AbortController(); pageController.current = controller; setPageStatus('loading');
    const request = mode === 'demo' ? Promise.resolve(demoListing(query)) : fetchCatalogPage('/api/v1/', query, controller.signal);
    request.then(result => { if (!controller.signal.aborted) { setPage(result); setPageResultKey(`${mode}:${catalogQueryParams(query).toString()}`); setPageStatus('ready'); } }).catch(() => { if (!controller.signal.aborted) { setPageResultKey(`${mode}:${catalogQueryParams(query).toString()}`); setPageStatus('error'); } });
    return () => controller.abort();
  }, [mode, query, parsed?.error, retry]);
  const clear = () => { const next = emptyCatalogQuery(); next.currency = !parsed?.error && facets?.currencies.includes(query?.currency ?? '') ? query!.currency : ''; navigate(next); setDrawer(false); };
  const update = (next: CatalogQuery) => { if (canMutate) navigate(next); setDrawer(false); };
  const remove = (group: 'category' | 'material' | 'color', slug: string) => query && navigate({ ...query, [group]: query[group].filter(item => item !== slug), page: 1 });
  const label = (group: 'category' | 'material' | 'color', slug: string) => {
    const choices = group === 'category' ? facets?.categories : group === 'material' ? facets?.materials : facets?.colors;
    return choices?.find(item => item.slug === slug)?.name ?? slug;
  };
  const filterCount = query ? Number(!!query.search) + query.category.length + query.material.length + query.color.length + Number(!!query.minPriceMinor) + Number(!!query.maxPriceMinor) : 0;
  const pages = page ? Math.ceil(page.total / page.limit) : 0;
  const currencyUnavailable = !!query?.currency && currentFacetStatus === 'ready' && !!facets && !facets.currencies.includes(query.currency);
  return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <div className="listing-header"><Header brand={brand} demo={mode === 'demo'} count={cart.count} onCartOpen={() => setCartOpen(true)} /></div>
    <main id="contenido" className="catalog-page">
      <div className="catalog-intro section-wrap"><p className="breadcrumb"><a href="/">Inicio</a> / Objetos</p><span className="eyebrow">DISEÑO PARA TODOS LOS DÍAS</span><h1>Objetos con personalidad.</h1><p>Explorá formas, colores y detalles para hacer tu espacio más tuyo.</p></div>
      <div className="catalog-shell section-wrap">
        <aside className="desktop-filters" aria-label="Filtros del catálogo">
          {!parsed?.error && query && facets && currentFacetStatus === 'ready' && <FilterControls value={query} facets={facets} onApply={update} onClear={clear} />}
          {!parsed?.error && currentFacetStatus === 'loading' && <p role="status">Cargando filtros…</p>}
        </aside>
        <section className="catalog-results" aria-label="Resultados del catálogo">
          <div className="catalog-toolbar">
            <form className="catalog-search" onSubmit={event => { event.preventDefault(); if (query && canMutate) navigate({ ...query, search: search.trim().slice(0, 100), page: 1 }); }}><label className="sr-only" htmlFor="catalog-search">Buscar objetos</label><Icon name="search" /><input ref={searchRef} id="catalog-search" disabled={!canMutate} value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Buscar objetos" /><button type="submit" disabled={!canMutate}>Buscar</button></form>
            <label className="sort-control">Ordenar <select value={query?.sort ?? 'name_asc'} disabled={!canMutate} onChange={event => query && canMutate && navigate({ ...query, sort: event.target.value as CatalogSort, page: 1 })}><option value="name_asc">Nombre: A–Z</option><option value="name_desc">Nombre: Z–A</option><option value="price_asc" disabled={!query?.currency}>Precio: menor a mayor</option><option value="price_desc" disabled={!query?.currency}>Precio: mayor a menor</option></select></label>
            <button type="button" className="mobile-filter-button small-outline" disabled={!canMutate || !facets || currentFacetStatus !== 'ready'} onClick={() => setDrawer(true)}>Filtros {filterCount > 0 && `(${filterCount})`}</button>
          </div>
          {!parsed?.error && query && filterCount > 0 && <div className="active-filters" aria-label="Filtros activos">
            {query.search && <button type="button" onClick={() => navigate({ ...query, search: '', page: 1 })}>Búsqueda: {query.search} ×</button>}
            {(['category', 'material', 'color'] as const).flatMap(group => query[group].map(slug => <button type="button" key={`${group}-${slug}`} onClick={() => remove(group, slug)}>{label(group, slug)} ×</button>))}
            {query.minPriceMinor && <button type="button" onClick={() => navigate({ ...query, minPriceMinor: '', page: 1 })}>Desde {formatPrice(Number(query.minPriceMinor), query.currency)} ×</button>}
            {query.maxPriceMinor && <button type="button" onClick={() => navigate({ ...query, maxPriceMinor: '', page: 1 })}>Hasta {formatPrice(Number(query.maxPriceMinor), query.currency)} ×</button>}
            <button type="button" className="clear-filters" onClick={clear}>Limpiar todo</button>
          </div>}
          {parsed?.error && <div className="listing-state" role="alert"><p>{parsed.error}</p><button type="button" className="small-outline" onClick={clear}>Limpiar filtros</button></div>}
          {!parsed?.error && (currentFacetStatus === 'error' || currentPageStatus === 'error') && <div className="listing-state" role="alert"><p>No pudimos cargar el catálogo y sus filtros. Intentá nuevamente.</p><button type="button" className="small-outline" onClick={() => setRetry(n => n + 1)}>Reintentar</button></div>}
          {!parsed?.error && currencyUnavailable && <div className="listing-state" role="alert"><p>La moneda del enlace no está disponible en este catálogo. Elegí otra moneda.</p></div>}
          {!parsed?.error && currentFacetStatus !== 'error' && currentPageStatus !== 'error' && !currencyUnavailable && <>
            {currentPageStatus === 'loading' || currentFacetStatus === 'loading' ? <p className="listing-state" role="status">Cargando objetos…</p> : page && <>
              <p className="result-count" aria-live="polite">{page.total} {page.total === 1 ? 'objeto' : 'objetos'}</p>
              {page.items.length ? <div className="product-grid listing-grid">{page.items.map(item => <ProductCard key={item.id} product={item} demo={mode === 'demo'} />)}</div> : <div className="listing-state"><h2>No encontramos objetos.</h2><p>{page.total > 0 ? 'Esta página ya no tiene resultados.' : 'Probá cambiar o limpiar los filtros.'}</p><button type="button" className="small-outline" onClick={clear}>Limpiar filtros</button></div>}
              {pages > 1 && query && <nav className="pagination" aria-label="Páginas de resultados"><button type="button" disabled={query.page <= 1} onClick={() => navigate({ ...query, page: query.page - 1 })}>← Anterior</button><span>Página {query.page} de {pages}</span><button type="button" disabled={query.page >= pages || query.page >= 10000} onClick={() => navigate({ ...query, page: query.page + 1 })}>Siguiente →</button></nav>}
              {query && query.page >= 10000 && pages > 10000 && <p className="filter-note">Refiná los filtros para ver otros resultados.</p>}
            </>}
          </>}
        </section>
      </div>
    </main>
    <footer><a className="brand" href="/">{brand}</a><p>Diseño, color y objetos para vivir distinto.</p><a href="#contenido">Volver arriba ↑</a></footer>
    <Dialog open={drawer} onClose={() => setDrawer(false)} label="Filtros del catálogo" className="filter-dialog"><div className="filter-dialog-inner"><button className="dialog-close" aria-label="Cerrar filtros" onClick={() => setDrawer(false)}><Icon name="close" /></button>{drawer && query && facets && <FilterControls value={query} facets={facets} mobile onApply={update} onCancel={() => setDrawer(false)} onClear={clear} />}</div></Dialog>

    <CartDialog open={cartOpen} onClose={() => setCartOpen(false)} mode={mode} items={cart.items} count={cart.count} totals={cart.totals} onAdjust={cart.adjust} removedNotice={cart.removedNotice} status={cart.status} storageUnavailable={cart.storageUnavailable} unresolved={cart.unresolved} onRetry={cart.retry} />
  </>;
}
