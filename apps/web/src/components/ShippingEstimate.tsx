'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatPrice } from '../lib/cart';
import { parseShippingResult, shippingKey, type QuoteLine, type SelectedShipping, type ShippingResult } from '../lib/shipping-client';

export function ShippingEstimate({ mode, lines, unresolved, onSelectionChange }: { mode: 'api' | 'demo'; lines: QuoteLine[]; unresolved: boolean; onSelectionChange?: (selection: SelectedShipping | null) => void }) {
  const [city, setCity] = useState(''), [state, setState] = useState(''), [postalCode, setPostalCode] = useState('');
  const [response, setResponse] = useState<{ key: string; value: ShippingResult } | null>(null);
  const [loadingKey, setLoadingKey] = useState(''), [errorKey, setErrorKey] = useState(''), [selection, setSelection] = useState('');
  const active = useRef<AbortController | null>(null);
  const destination = { country: 'AR' as const, city: city.trim(), state: state.trim(), postalCode: postalCode.trim() };
  const key = shippingKey(lines, destination);
  useEffect(() => () => active.current?.abort(), []);
  function invalidate() { active.current?.abort(); setResponse(null); setLoadingKey(''); setErrorKey(''); setSelection(''); onSelectionChange?.(null); }
  const result = response?.key === key ? response.value : null;
  const loading = loadingKey === key;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== 'api' || unresolved || !city.trim() || !state.trim() || !postalCode.trim() || loading) return;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setLoadingKey(key); setErrorKey(''); setResponse(null); setSelection(''); onSelectionChange?.(null);
    try {
      const request = await fetch('/api/v1/shipping/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines, destination }), signal: controller.signal });
      if (!request.ok) throw new Error('No disponible');
      const value = parseShippingResult(await request.json());
      if (!controller.signal.aborted) setResponse({ key, value });
    } catch { if (!controller.signal.aborted) setErrorKey(key); }
    finally { if (!controller.signal.aborted) setLoadingKey(''); }
  }
  return <section className="shipping-estimate" aria-labelledby="shipping-title">
    <h2 id="shipping-title">Envío estimado</h2>
    <p>{mode === 'demo' ? 'El cálculo no está disponible en el modo de demostración.' : 'Indicá el destino para consultar las opciones disponibles.'}</p>
    <form onSubmit={submit}>
      <label htmlFor="shipping-state">Provincia</label>
      <div className="shipping-controls"><input id="shipping-state" autoComplete="address-level1" maxLength={150} value={state} onChange={event => { invalidate(); setState(event.target.value); }} required /></div>
      <label htmlFor="shipping-city">Localidad</label>
      <div className="shipping-controls"><input id="shipping-city" autoComplete="address-level2" maxLength={150} value={city} onChange={event => { invalidate(); setCity(event.target.value); }} required /></div>
      <label htmlFor="shipping-postcode">Código postal</label>
      <div className="shipping-controls"><input id="shipping-postcode" autoComplete="postal-code" maxLength={16} value={postalCode} onChange={event => { invalidate(); setPostalCode(event.target.value); }} required /></div>
      <div className="shipping-controls"><button type="submit" disabled={mode !== 'api' || unresolved || loading}>{loading ? 'Consultando…' : 'Calcular envío'}</button></div>
    </form>
    <div aria-live="polite">
      {unresolved && <p>Esperá a que se verifiquen los artículos del carrito.</p>}
      {errorKey === key && <p>No se pudo consultar el envío. Intentá más tarde.</p>}
      {result?.status === 'unavailable' && <p>{result.reason === 'NO_OPTIONS' ? 'No hay opciones disponibles para este destino.' : 'El cálculo de envío no está disponible por el momento.'}</p>}
      {result?.status === 'quoted' && <><p>Calculado en {result.packageCount} bulto{result.packageCount === 1 ? '' : 's'}.</p>
        <fieldset><legend>Opciones de entrega</legend>{result.options.flatMap((option, index) => {
          const choices = option.pickupPoints?.length ? option.pickupPoints.map(point => ({ key: `${index}:${point.id}`, label: point.description })) : [{ key: `${index}`, label: option.serviceName }];
          return choices.map(choice => <label key={choice.key}><input type="radio" name="shipping-option" value={choice.key} checked={selection === choice.key} onChange={() => { setSelection(choice.key); onSelectionChange?.({ amountMinor: option.amountMinor, currency: option.currency }); }} /> {option.carrierName} · {choice.label} · {formatPrice(BigInt(option.amountMinor), option.currency)}</label>);
        })}</fieldset>{selection && <p>Selección estimada; el pago todavía no está disponible.</p>}</>}
    </div>
  </section>;
}
