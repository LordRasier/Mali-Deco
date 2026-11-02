'use client';

import { useEffect, useState } from 'react';
import { apiRequest, ApiError } from './api';
import { failureMessage, Pagination } from './Catalog';
import { ProductForm, VariantForm } from './forms';
import { useSession } from './session';
import type { Product, ProductInput, Variant, VariantInput } from './types';

interface Detail extends Product { variants: Variant[]; page: number; limit: number; total: number }

export function ProductDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { csrf } = useSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<'product' | 'new-variant' | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const path = `/admin/catalog/products/${encodeURIComponent(id)}`;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    apiRequest<Detail>(`${path}?page=${page}&limit=24`)
      .then((data) => { if (current) setDetail(data); })
      .catch((failure) => {
        if (!current) return;
        setDetail(null);
        if (!(failure instanceof ApiError && failure.status === 401)) setError(failureMessage(failure));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [path, page, revision]);

  async function mutate(method: 'POST' | 'PUT' | 'DELETE', target: string, body?: ProductInput | VariantInput) {
    if (busy || !csrf) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(target, { method, body, csrf });
      setEditing(null);
      setRevision((value) => value + 1);
    } finally { setBusy(false); }
  }

  async function archive(target: string, label: string) {
    if (busy || !window.confirm(`¿Archivar ${label}? Esta acción no se puede deshacer desde este panel.`)) return;
    try { await mutate('DELETE', target); } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) setError(failureMessage(failure));
    }
  }

  const activeVariant = detail?.variants.find((variant) => variant.id === editing);
  return (
    <main className="admin-main">
      <button className="link-button" disabled={busy} onClick={onBack}>← Catálogo</button>
      {loading && <p role="status">Cargando artículo…</p>}
      {error && (
        <div className="notice error" role="alert">
          {error} {!detail && <button onClick={() => setRevision((value) => value + 1)}>Reintentar</button>}
        </div>
      )}
      {detail && !loading && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                Artículo · {detail.archivedAt ? 'Archivado' : detail.status === 'active' ? 'Activo' : 'Borrador'}
              </span>
              <h1>{detail.name}</h1>
              <p className="muted">/{detail.slug}</p>
            </div>
            {!detail.archivedAt && !editing && (
              <div className="actions">
                <button disabled={busy} onClick={() => setEditing('product')}>Editar artículo</button>
                <button className="danger" disabled={busy} onClick={() => archive(path, `“${detail.name}”`)}>Archivar</button>
              </div>
            )}
          </div>
          {detail.archivedAt && (
            <p className="notice">Artículo archivado. Se conserva en consulta y no puede editarse ni restaurarse desde este panel.</p>
          )}
          {editing === 'product' ? (
            <ProductForm initial={detail} busy={busy} onCancel={() => setEditing(null)} onSubmit={(input) => mutate('PUT', path, input)} />
          ) : (
            <div className="panel">
              <h2>Información general</h2>
              <p>{detail.description || 'Sin descripción.'}</p>
              <div className="spec-grid">
                <div><strong>Producto</strong><p>{formatDimensions(detail, 'product')}</p></div>
                <div><strong>Embalaje</strong><p>{formatDimensions(detail, 'package')}</p></div>
              </div>
            </div>
          )}
          {editing === 'new-variant' && (
            <VariantForm busy={busy} onCancel={() => setEditing(null)} onSubmit={(input) => mutate('POST', `${path}/variants`, input)} />
          )}
          {activeVariant && (
            <VariantForm
              initial={activeVariant}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => mutate('PUT', `${path}/variants/${encodeURIComponent(activeVariant.id)}`, input)}
            />
          )}
          {!editing && (
            <section className="panel">
              <div className="section-heading compact">
                <div>
                  <h2>Variantes</h2>
                  <p className="muted">Precio en unidades menores y modalidad de suministro; no indica disponibilidad.</p>
                </div>
                {!detail.archivedAt && <button disabled={busy} onClick={() => setEditing('new-variant')}>+ Agregar variante</button>}
              </div>
              {detail.variants.length ? (
                <>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Variante / SKU</th><th>Precio</th><th>Modalidad</th><th>Estado</th>
                          <th><span className="sr-only">Acciones</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.variants.map((variant) => (
                          <tr key={variant.id}>
                            <td><strong>{variant.name}</strong><br /><span className="muted">{variant.sku}</span></td>
                            <td>{variant.priceMinor} {variant.currency} <span className="muted">unid. menores</span></td>
                            <td>{variant.supplyMode === 'stock' ? 'Stock' : variant.supplyMode === 'made_to_order' ? 'A pedido' : 'Sin definir'}</td>
                            <td><span className="badge">{variant.archivedAt ? 'Archivada' : 'Vigente'}</span></td>
                            <td>
                              {!detail.archivedAt && !variant.archivedAt && (
                                <div className="actions">
                                  <button className="link-button" disabled={busy} onClick={() => setEditing(variant.id)}>Editar</button>
                                  <button
                                    className="link-button danger"
                                    disabled={busy}
                                    onClick={() => archive(`${path}/variants/${encodeURIComponent(variant.id)}`, `la variante “${variant.name}”`)}
                                  >Archivar</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} total={detail.total} limit={detail.limit} onChange={setPage} />
                </>
              ) : (
                <>
                  <p className="empty-state">Este artículo no tiene variantes en esta página.</p>
                  <Pagination page={page} total={detail.total} limit={detail.limit} onChange={setPage} />
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function formatDimensions(product: Product, prefix: 'product' | 'package') {
  const values = [product[`${prefix}WeightG`], product[`${prefix}WidthMm`], product[`${prefix}HeightMm`], product[`${prefix}LengthMm`]];
  return `Peso: ${values[0] ?? '—'} g · Ancho: ${values[1] ?? '—'} mm · Alto: ${values[2] ?? '—'} mm · Largo: ${values[3] ?? '—'} mm`;
}
