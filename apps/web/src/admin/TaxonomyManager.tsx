'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from './api';
import { failureMessage, Pagination } from './Catalog';
import { useSession } from './session';
import { isTaxonomyItem, isTaxonomyPage } from './taxonomy-data';
import type { Page, TaxonomyItem, TaxonomyKind } from './types';

const labels: Record<TaxonomyKind, string> = { categories: 'Categorías', materials: 'Materiales', colors: 'Colores' };
type Draft = { name: string; slug: string; sortOrder: string; hex: string };
const emptyDraft = (): Draft => ({ name: '', slug: '', sortOrder: '0', hex: '' });

export function taxonomyInput(kind: TaxonomyKind, draft: Draft, create: boolean) {
  const name = draft.name.trim();
  if (!name || name.length > 100) throw new Error('El nombre debe tener entre 1 y 100 caracteres.');
  if (create && (draft.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug))) throw new Error('El identificador debe usar hasta 80 minúsculas, números y guiones.');
  if (!/^\d+$/.test(draft.sortOrder)) throw new Error('El orden debe ser un número entero entre 0 y 4294967295.');
  const sortOrder = Number(draft.sortOrder);
  if (!Number.isSafeInteger(sortOrder) || sortOrder > 4294967295) throw new Error('El orden debe ser un número entero entre 0 y 4294967295.');
  const hex = draft.hex.trim();
  if (kind === 'colors' && hex && !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('El color debe ser hexadecimal, por ejemplo #F47B6B.');
  return { name, sortOrder, ...(create ? { slug: draft.slug } : {}), ...(kind === 'colors' ? { hex: hex || null } : {}) };
}

/** Real, authenticated taxonomy management; no sample or client-side persistence. */
export function TaxonomyManager({ onBack }: { onBack: () => void }) {
  const { csrf } = useSession();
  const [kind, setKind] = useState<TaxonomyKind>('categories');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Page<TaxonomyItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<TaxonomyItem | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const sending = useRef(false);
  const base = `/admin/catalog/${kind}`;

  useEffect(() => {
    let current = true;
    setData(null);
    setLoading(true);
    setError('');
    apiRequest<Page<TaxonomyItem>>(`${base}?page=${page}&limit=24`).then(result => {
      if (!isTaxonomyPage(result, page, 24)) throw new Error('El servicio devolvió una lista de clasificaciones inválida.');
      if (current) setData(result);
    }).catch((failure: unknown) => {
      if (current && !(failure instanceof ApiError && failure.status === 401)) setError(failureMessage(failure));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [base, page, revision]);

  function selectKind(next: TaxonomyKind) {
    setKind(next); setPage(1); setEditing(null); setError('');
  }
  function edit(item: TaxonomyItem | 'new') {
    setError(''); setEditing(item);
    setDraft(item === 'new' ? emptyDraft() : { name: item.name, slug: item.slug, sortOrder: String(item.sortOrder), hex: item.hex ?? '' });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !csrf || sending.current) return;
    try {
      const input = taxonomyInput(kind, draft, editing === 'new');
      sending.current = true; setBusy(true); setError('');
      const saved = await apiRequest<unknown>(editing === 'new' ? base : `${base}/${encodeURIComponent(editing.id)}`, { method: editing === 'new' ? 'POST' : 'PUT', body: input, csrf });
      if (!isTaxonomyItem(saved) || (editing !== 'new' && saved.id !== editing.id)) throw new Error('No se pudo confirmar el resultado. La operación podría haberse completado; revisá las clasificaciones antes de reintentar.');
      setEditing(null); setPage(1); setRevision(value => value + 1);
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) setError(failureMessage(failure));
    } finally { sending.current = false; setBusy(false); }
  }
  async function archive(item: TaxonomyItem) {
    if (!csrf || sending.current || !window.confirm(`¿Archivar “${item.name}”? Solo se puede archivar si ningún artículo o variante lo utiliza.`)) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const result = await apiRequest<unknown>(`${base}/${encodeURIComponent(item.id)}`, { method: 'DELETE', csrf });
      if (result !== undefined) throw new Error('No se pudo confirmar el resultado. La operación podría haberse completado; revisá las clasificaciones antes de reintentar.');
      setPage(1); setRevision(value => value + 1);
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) setError(failureMessage(failure));
    } finally { sending.current = false; setBusy(false); }
  }

  return (
    <main className="admin-main">
      <button className="link-button" disabled={busy || !!editing} onClick={onBack}>← Catálogo</button>
      <div className="section-heading">
        <div><span className="eyebrow">Catálogo</span><h1>Clasificaciones</h1><p>Organizá las opciones que se pueden asignar a los artículos y sus variantes.</p></div>
        {!editing && <button className="primary" disabled={busy} onClick={() => edit('new')}>+ Agregar opción</button>}
      </div>
      <nav aria-label="Tipo de clasificación" className="taxonomy-tabs">
        {(Object.keys(labels) as TaxonomyKind[]).map(key => <button key={key} type="button" disabled={busy || !!editing} aria-current={kind === key ? 'page' : undefined} onClick={() => selectKind(key)}>{labels[key]}</button>)}
      </nav>
      {error && <p className="notice error" role="alert">{error}</p>}
      {editing && <p className="admin-hint">Guardá o cancelá la edición para cambiar de sección.</p>}
      {editing ? (
        <form className="admin-form" onSubmit={save} noValidate>
          <h2>{editing === 'new' ? 'Nueva opción' : 'Editar opción'} · {labels[kind]}</h2>
          <div className="admin-form-grid">
            <label>Nombre<input disabled={busy} maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Identificador (slug)<input disabled={busy || editing !== 'new'} maxLength={80} value={draft.slug} onChange={event => setDraft({ ...draft, slug: event.target.value })} /><small>Se establece al crear y no puede cambiarse.</small></label>
            <label>Orden<input disabled={busy} inputMode="numeric" value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: event.target.value })} /><small>Los números menores aparecen primero.</small></label>
            {kind === 'colors' && <label>Color hexadecimal (opcional)<input disabled={busy} maxLength={7} placeholder="#F47B6B" value={draft.hex} onChange={event => setDraft({ ...draft, hex: event.target.value })} /></label>}
          </div>
          <div className="admin-actions"><button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" disabled={busy} onClick={() => { setEditing(null); setError(''); }}>Cancelar</button></div>
        </form>
      ) : (
        <section className="panel" aria-label={labels[kind]}>
          {loading && <p role="status">Cargando opciones…</p>}
          {!loading && error && !data && <button onClick={() => setRevision(value => value + 1)}>Reintentar</button>}
          {!loading && data && <>
            {data.items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Nombre</th><th>Identificador</th><th>Orden</th>{kind === 'colors' && <th>Color</th>}<th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
              {data.items.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.slug}</td><td>{item.sortOrder}</td>{kind === 'colors' && <td>{item.hex ?? '—'}</td>}<td><div className="actions"><button className="link-button" disabled={busy} onClick={() => edit(item)}>Editar</button><button className="link-button danger" disabled={busy} onClick={() => archive(item)}>Archivar</button></div></td></tr>)}
            </tbody></table></div> : <p className="empty-state">No hay opciones en esta página.</p>}
            <Pagination page={page} total={data.total} limit={data.limit} onChange={setPage} />
          </>}
        </section>
      )}
      <p className="muted scope-note">Las opciones en uso no se pueden archivar. Las asignaciones se cambian desde cada artículo o variante.</p>
    </main>
  );
}
