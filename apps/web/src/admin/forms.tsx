'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { Product, ProductInput, Variant, VariantInput } from './types';
import { assignmentPatch, dimensionFields, productInput, variantInput, type ProductDraft, type VariantDraft } from './form-validation';
import { currencyFractionDigits, minorToDecimal } from './money';
import { TaxonomySelect } from './TaxonomySelect';

type FormProps<T, Input> = {
  initial?: T;
  onSubmit: (input: Input) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
};

function productDraft(initial?: Product): ProductDraft {
  const values = Object.fromEntries(dimensionFields.map(([key]) => [key, initial?.[key]?.toString() ?? '']));
  return {
    name: initial?.name ?? '', slug: initial?.slug ?? '', description: initial?.description ?? '',
    status: initial?.status ?? 'draft', ...values,
  } as ProductDraft;
}

export function ProductForm({ initial, onSubmit, onCancel, busy }: FormProps<Product, ProductInput>) {
  const [draft, setDraft] = useState(() => productDraft(initial));
  const [error, setError] = useState('');
  const [category, setCategory] = useState<string | null>(initial?.categoryId ?? null);
  const [categoryChanged, setCategoryChanged] = useState(false);
  const unitDimensionsComplete = dimensionFields.slice(0, 4).every(([key]) => /^\d+$/.test(draft[key].trim()) && Number.isSafeInteger(Number(draft[key])) && Number(draft[key]) > 0);
  const sending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || sending.current) return;
    try {
      const input = { ...productInput(draft), ...assignmentPatch('categoryId', categoryChanged, category) };
      sending.current = true;
      setError('');
      await onSubmit(input);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el producto.');
    } finally { sending.current = false; }
  }
  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="admin-form-grid">
        <label>Nombre<input disabled={busy} value={draft.name} maxLength={255} onChange={e => setDraft({ ...draft, name: e.target.value })} required /></label>
        <label>Identificador (slug)<input disabled={busy} value={draft.slug} maxLength={255} onChange={e => setDraft({ ...draft, slug: e.target.value })} required /><small>Minúsculas, números y guiones; por ejemplo, florero-coral.</small></label>
        <TaxonomySelect kind="categories" label="Categoría principal" value={category} disabled={busy} onChange={value => { setCategory(value); setCategoryChanged(true); }} />
        <label>Estado<select disabled={busy} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as ProductDraft['status'] })}><option value="draft">Borrador</option><option value="active">Activo</option></select></label>
      </div>
      <label>Descripción<textarea disabled={busy} value={draft.description} rows={4} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <p className="admin-hint">Medidas opcionales en números enteros. El producto y el paquete se registran por separado.</p>
      {[['Peso y medidas del producto por unidad', dimensionFields.slice(0, 4)], ['Paquete', dimensionFields.slice(4)]].map(([title, fields]) => (
        <fieldset key={title as string}>
          <legend>{title as string}</legend>
          {title === 'Peso y medidas del producto por unidad' && <p className="admin-hint">{unitDimensionsComplete ? 'Peso y medidas completos.' : 'Peso y medidas incompletos: se necesitan los cuatro datos para cotizar el envío.'} Las medidas del producto no agregan automáticamente el peso ni el espacio del embalaje.</p>}
          <div className="admin-form-grid">
            {(fields as typeof dimensionFields[number][]).map(([key, label]) => (
              <label key={key}>{label}<input disabled={busy} inputMode="numeric" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-actions"><button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}

function variantDraft(initial?: Variant): VariantDraft {
  const currency = initial?.currency ?? 'ARS';
  return {
    sku: initial?.sku ?? '', name: initial?.name ?? '', currency,
    price: initial ? minorToDecimal(initial.priceMinor, currency) : '',
    supplyMode: initial?.supplyMode ?? '',
  };
}

export function VariantForm({ initial, onSubmit, onCancel, busy }: FormProps<Variant, VariantInput>) {
  const [draft, setDraft] = useState(() => variantDraft(initial));
  const [error, setError] = useState('');
  const [material, setMaterial] = useState<string | null>(initial?.materialId ?? null);
  const [color, setColor] = useState<string | null>(initial?.colorId ?? null);
  const [materialChanged, setMaterialChanged] = useState(false);
  const [colorChanged, setColorChanged] = useState(false);
  const sending = useRef(false);
  let digits: number | null = null;
  try { digits = currencyFractionDigits(draft.currency); } catch { /* validation shown on submit */ }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || sending.current) return;
    try {
      const input = { ...variantInput(draft), ...assignmentPatch('materialId', materialChanged, material), ...assignmentPatch('colorId', colorChanged, color) };
      sending.current = true;
      setError('');
      await onSubmit(input);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la variante.');
    } finally { sending.current = false; }
  }
  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="admin-form-grid">
        <label>SKU<input disabled={busy} value={draft.sku} maxLength={255} onChange={e => setDraft({ ...draft, sku: e.target.value })} required /></label>
        <label>Nombre de la variante<input disabled={busy} value={draft.name} maxLength={255} onChange={e => setDraft({ ...draft, name: e.target.value })} required /></label>
        <label>Moneda<input disabled={busy} value={draft.currency} maxLength={3} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} required /><small>Código de tres letras, por ejemplo ARS.</small></label>
        <label>Precio<input disabled={busy} inputMode="decimal" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} required /><small>{digits === null ? 'Indicá primero una moneda válida.' : `Hasta ${digits} decimales; no se realiza conversión de moneda.`}</small></label>
        <TaxonomySelect kind="materials" label="Material" value={material} disabled={busy} onChange={value => { setMaterial(value); setMaterialChanged(true); }} />
        <TaxonomySelect kind="colors" label="Color" value={color} disabled={busy} onChange={value => { setColor(value); setColorChanged(true); }} />
        <label>Modo de suministro<select disabled={busy} value={draft.supplyMode} onChange={e => setDraft({ ...draft, supplyMode: e.target.value as VariantDraft['supplyMode'] })}><option value="">Elegir…</option><option value="stock">Stock</option><option value="made_to_order">A pedido</option></select></label>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-actions"><button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar variante'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}
