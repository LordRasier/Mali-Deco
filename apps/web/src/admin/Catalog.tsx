'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, ApiError } from './api';
import { ProductForm } from './forms';
import { useSession } from './session';
import type { Page, Product, ProductInput } from './types';
import { ProductDetail } from './ProductDetail';
import { TaxonomyManager } from './TaxonomyManager';
import { StoreSettings } from './StoreSettings';

const base = '/admin/catalog/products';

export function failureMessage(failure: unknown) {
  return failure instanceof Error ? failure.message : 'Ocurrió un error inesperado.';
}

export function Catalog() {
  const { csrf, user } = useSession();
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'taxonomy'>('list');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Page<Product> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (view !== 'list') return;
    let current = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: '24' });
    if (search) params.set('search', search);
    apiRequest<Page<Product>>(`${base}?${params}`)
      .then((data) => { if (current) setResult(data); })
      .catch((failure) => {
        if (!current) return;
        setResult(null);
        if (!(failure instanceof ApiError && failure.status === 401)) setError(failureMessage(failure));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [view, page, search, revision]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  async function createProduct(input: ProductInput) {
    if (busy || !csrf) return;
    setBusy(true);
    setError('');
    try {
      const product = await apiRequest<Product>(base, { method: 'POST', body: input, csrf });
      setSelectedId(product.id);
      setView('detail');
    } finally { setBusy(false); }
  }

  function backToList() {
    setError('');
    setView('list');
    setRevision((value) => value + 1);
  }

  if (view === 'taxonomy') return <TaxonomyManager onBack={backToList} />;
  if (view === 'detail') return <ProductDetail id={selectedId} onBack={backToList} />;
  if (view === 'create') {
    return (
      <main className="admin-main">
        <button className="link-button" onClick={backToList}>← Catálogo</button>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Catálogo</span>
            <h1>Nuevo artículo</h1>
            <p>Completá los datos generales. Después podrás agregar variantes.</p>
          </div>
        </div>
        {error && <p className="notice error" role="alert">{error}</p>}
        <ProductForm onSubmit={createProduct} onCancel={backToList} busy={busy} />
      </main>
    );
  }

  return (
    <main className="admin-main">
      {user?.role === 'owner' && <StoreSettings />}
      <div className="section-heading">
        <div>
          <span className="eyebrow">Administración</span>
          <h1>Catálogo</h1>
          <p>Gestioná artículos y variantes, desde un solo lugar.</p>
        </div>
        <div className="actions"><button onClick={() => { setError(''); setView('taxonomy'); }}>Categorías, materiales y colores</button><button className="primary" onClick={() => { setError(''); setView('create'); }}>+ Nuevo artículo</button></div>
      </div>
      <div className="panel">
        <form className="toolbar" onSubmit={submitSearch}>
          <label>
            Buscar por nombre
            <input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del artículo" />
          </label>
          <button type="submit">Buscar</button>
        </form>
        {loading && <p role="status">Cargando artículos…</p>}
        {error && (
          <div className="notice error" role="alert">
            {error} <button onClick={() => setRevision((value) => value + 1)}>Reintentar</button>
          </div>
        )}
        {!loading && !error && result && (
          result.items.length ? (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Artículo</th><th>Estado</th><th>Identificador</th><th><span className="sr-only">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {result.items.map((product) => (
                      <tr key={product.id}>
                        <td><strong>{product.name}</strong></td>
                        <td><span className="badge">{product.archivedAt ? 'Archivado' : product.status === 'active' ? 'Activo' : 'Borrador'}</span></td>
                        <td className="muted">{product.slug}</td>
                        <td><button className="link-button" onClick={() => { setSelectedId(product.id); setView('detail'); }}>Ver detalle →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={result.total} limit={result.limit} onChange={setPage} />
            </>
          ) : (
            <>
              <p className="empty-state">No hay artículos para mostrar en esta página.</p>
              <Pagination page={page} total={result.total} limit={result.limit} onChange={setPage} />
            </>
          )
        )}
      </div>
      <p className="muted scope-note">Inventario e imágenes aún no cuentan con administración conectada.</p>
    </main>
  );
}

export function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <span>Página {page} de {pages} · {total} en total</span>
      <div>
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
        <button disabled={page >= pages || page >= 10000} onClick={() => onChange(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
