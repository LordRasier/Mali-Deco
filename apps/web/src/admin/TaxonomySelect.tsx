'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { isTaxonomyPage } from './taxonomy-data';
import type { Page, TaxonomyItem, TaxonomyKind } from './types';

const PAGE_SIZE = 100;
const MAX_OPTIONS = 1000;

/** A complete, bounded snapshot prevents a partial selector from silently clearing assignments. */
export async function loadTaxonomy(kind: TaxonomyKind): Promise<TaxonomyItem[]> {
  const result: TaxonomyItem[] = [];
  let total = 0;
  let page = 1;
  do {
    const response = await apiRequest<Page<TaxonomyItem>>(`/admin/catalog/${kind}?page=${page}&limit=${PAGE_SIZE}`);
    if (!isTaxonomyPage(response, page, PAGE_SIZE) || response.total > MAX_OPTIONS || (page > 1 && response.total !== total)) {
      throw new Error('No se pudo cargar la lista completa. Revisá las clasificaciones antes de modificarlas.');
    }
    total = response.total;
    if (response.items.length !== Math.min(PAGE_SIZE, total - result.length)) {
      throw new Error('El servicio devolvió una lista de clasificaciones incompleta.');
    }
    result.push(...response.items);
    if (result.length > total || new Set(result.map(item => item.id)).size !== result.length) throw new Error('La lista de clasificaciones cambió. Volvé a cargarla.');
    page += 1;
  } while (result.length < total);
  return result;
}

export function TaxonomySelect({ kind, label, value, onChange, disabled }: {
  kind: TaxonomyKind; label: string; value: string | null; onChange: (value: string | null) => void; disabled: boolean;
}) {
  const [items, setItems] = useState<TaxonomyItem[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setItems(null);
    setError('');
    loadTaxonomy(kind).then(data => { if (current) setItems(data); }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las opciones.');
    });
    return () => { current = false; };
  }, [kind, revision]);
  return (
    <div>
      <label>{label}
        <select disabled={disabled || !items} value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
          <option value="">Sin asignar</option>
          {value && !items?.some(item => item.id === value) && <option value={value}>Asignación actual no disponible</option>}
          {items?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {!items && !error && <small>Cargando opciones…</small>}
      {error && <p className="admin-error" role="alert">{error} La asignación actual se conservará. <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p>}
    </div>
  );
}
