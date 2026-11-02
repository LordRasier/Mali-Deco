'use client';

import { useEffect, useState } from 'react';
import { displayPriceToMinor, emptyCatalogQuery, minorToDisplayPrice, type CatalogQuery } from '../lib/catalog-query';
import type { Facets, Lookup } from '../lib/storefront-types';

type Group = 'category' | 'material' | 'color';
export function FilterControls({ value, facets, mobile, onApply, onCancel, onClear }: { value: CatalogQuery; facets: Facets; mobile?: boolean; onApply: (query: CatalogQuery) => void; onCancel?: () => void; onClear: () => void }) {
  const [draft, setDraft] = useState(value);
  const [min, setMin] = useState(() => minorToDisplayPrice(value.minPriceMinor, value.currency));
  const [max, setMax] = useState(() => minorToDisplayPrice(value.maxPriceMinor, value.currency));
  const [error, setError] = useState('');
  useEffect(() => { setDraft(value); setMin(minorToDisplayPrice(value.minPriceMinor, value.currency)); setMax(minorToDisplayPrice(value.maxPriceMinor, value.currency)); setError(''); }, [value]);
  const update = (next: CatalogQuery) => { setDraft(next); if (!mobile) onApply({ ...next, page: 1 }); };
  const toggle = (group: Group, slug: string) => {
    const selected = draft[group];
    const values = selected.includes(slug) ? selected.filter(item => item !== slug) : [...selected, slug];
    if (values.length <= 20) update({ ...draft, [group]: values });
  };
  const group = (label: string, key: Group, choices: Lookup[], truncated: boolean) => <fieldset className="filter-group">
    <legend>{label}</legend>
    {choices.length ? choices.map(choice => <label className="filter-check" key={choice.id}><input type="checkbox" checked={draft[key].includes(choice.slug)} disabled={!draft[key].includes(choice.slug) && draft[key].length >= 20} onChange={() => toggle(key, choice.slug)} /><span>{choice.name}</span></label>) : <p className="filter-note">Sin opciones publicadas.</p>}
    {truncated && <p className="filter-note">Se muestran las primeras 200 opciones.</p>}
  </fieldset>;
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const minPriceMinor = displayPriceToMinor(min, draft.currency), maxPriceMinor = displayPriceToMinor(max, draft.currency);
      if (minPriceMinor && maxPriceMinor && BigInt(minPriceMinor) > BigInt(maxPriceMinor)) throw new Error('El mínimo no puede superar el máximo.');
      setError(''); onApply({ ...draft, minPriceMinor, maxPriceMinor, page: 1 });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Revisá los importes.'); }
  };
  return <form className="filters-form" onSubmit={apply}>
    <div className="filter-title"><h2>Filtros</h2><button type="button" className="inline-link" onClick={() => {
      if (!mobile) { onClear(); return; }
      const next = emptyCatalogQuery(); next.currency = draft.currency;
      setDraft(next); setMin(''); setMax(''); setError('');
    }}>Limpiar</button></div>
    <fieldset className="filter-group"><legend>Moneda</legend>
      <label className="sr-only" htmlFor={mobile ? 'currency-mobile' : 'currency-desktop'}>Moneda de los precios</label>
      <select id={mobile ? 'currency-mobile' : 'currency-desktop'} value={draft.currency} onChange={event => { setMin(''); setMax(''); update({ ...draft, currency: event.target.value, minPriceMinor: '', maxPriceMinor: '', sort: draft.sort.startsWith('price_') && !event.target.value ? 'name_asc' : draft.sort }); }}>
        <option value="">Seleccionar moneda</option>{draft.currency && !facets.currencies.includes(draft.currency) && <option value={draft.currency}>{draft.currency} (no disponible)</option>}{facets.currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
      </select>
    </fieldset>
    {group('Categoría', 'category', facets.categories, facets.truncated.categories)}
    <fieldset className="filter-group"><legend>Precio</legend>
      <div className="price-fields"><label>Desde<input type="text" inputMode="decimal" placeholder="Mínimo" value={min} disabled={!draft.currency} onChange={event => setMin(event.target.value)} /></label><label>Hasta<input type="text" inputMode="decimal" placeholder="Máximo" value={max} disabled={!draft.currency} onChange={event => setMax(event.target.value)} /></label></div>
      <p className="filter-note">Importes en {draft.currency || 'la moneda elegida'}, sin separador de miles.</p>
      {!mobile && <button className="small-outline" type="submit">Aplicar precio</button>}
      {error && <p className="filter-error" role="alert">{error}</p>}
    </fieldset>
    {group('Material', 'material', facets.materials, facets.truncated.materials)}
    {group('Color', 'color', facets.colors, facets.truncated.colors)}
    {mobile && <div className="filter-actions"><button type="submit" className="button primary">Ver resultados</button><button type="button" className="button outline" onClick={onCancel}>Cancelar</button></div>}
  </form>;
}
