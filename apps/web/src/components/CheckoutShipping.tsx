'use client';
import { formatPrice } from '../lib/cart';
import { useEffect, useRef, useState } from 'react';
import type { Destination, Quote } from '../lib/checkout-client';

type Props = { postalCode:string; setPostalCode:(value:string)=>void; lookup:()=>void; lookupBusy:boolean; lookupStatus:string; destinations:Destination[]; candidateId:string; setCandidateId:(value:string)=>void; quote:Quote|null; quoteBusy:boolean; requestQuote:()=>void; optionId:string; setOptionId:(value:string)=>void; pointId:string; setPointId:(value:string)=>void; disabled:boolean };
export function CheckoutShipping(p: Props) {
  const [editing, setEditing] = useState(false);
  const postalRef = useRef<HTMLInputElement>(null), editRef = useRef<HTMLButtonElement>(null);
  const requestedFocus = useRef<'postal'|'edit'|null>(null);
  useEffect(() => {
    if (requestedFocus.current === 'postal' && editing) postalRef.current?.focus();
    if (requestedFocus.current === 'edit' && !editing) editRef.current?.focus();
    requestedFocus.current = null;
  }, [editing]);
  const destination = p.destinations.find(item => item.id === p.candidateId);
  const option = p.quote?.options.find(item => item.id === p.optionId);
  return <section className="checkout-section"><h2>Entrega</h2>
    {destination && !editing ? <div className="checkout-destination"><div><span>Destino</span><strong>{destination.label}</strong><span>CP {p.postalCode.trim()}</span></div><button ref={editRef} type="button" disabled={p.disabled} onClick={() => { requestedFocus.current = 'postal'; setEditing(true); }}>Editar destino</button></div> : <>
      <label htmlFor="checkout-postal">Código postal</label><div className="checkout-inline"><input ref={postalRef} id="checkout-postal" inputMode="numeric" autoComplete="postal-code" value={p.postalCode} onChange={e => { setEditing(true); p.setPostalCode(e.target.value); }} disabled={p.disabled} /><button type="button" onClick={() => { setEditing(true); p.lookup(); }} disabled={p.disabled || p.lookupBusy || !/^\d{4}$/.test(p.postalCode.trim())}>{p.lookupBusy ? 'Buscando…' : 'Buscar localidad'}</button></div>
      {p.destinations.length > 0 && <><label htmlFor="checkout-destination">Localidad</label><select id="checkout-destination" value={p.candidateId} onChange={e => { setEditing(true); p.setCandidateId(e.target.value); }} disabled={p.disabled}><option value="">Elegí una localidad</option>{p.destinations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></>}
      {p.lookupStatus === 'not_found' && <p role="status">No encontramos localidades para este código postal.</p>}
      {p.lookupStatus === 'too_many' && <p role="status">Hay demasiadas localidades para este código postal.</p>}
      {p.lookupStatus === 'invalid' && <p role="status">El código postal no es válido.</p>}
      {p.lookupStatus === 'unavailable' && <p role="status">La consulta de localidades no está disponible. Intentá nuevamente.</p>}
      {p.lookupStatus === 'needs_lookup' && <p role="status">Volvé a buscar la localidad para continuar.</p>}
      {destination && editing && <button type="button" onClick={() => { requestedFocus.current = 'edit'; setEditing(false); }} disabled={p.disabled}>Usar este destino</button>}
    </>}
    <button type="button" onClick={p.requestQuote} disabled={p.disabled || p.quoteBusy || !p.candidateId}>{p.quoteBusy ? 'Consultando…' : 'Consultar opciones'}</button>
    {p.quote && <fieldset><legend>Elegí una opción de entrega</legend>{p.quote.options.length === 0 && <p>No hay opciones disponibles para este destino.</p>}{p.quote.options.map(item => <label className="checkout-choice" key={item.id}><input type="radio" name="delivery" value={item.id} checked={p.optionId === item.id} onChange={() => p.setOptionId(item.id)} disabled={p.disabled} /> <span>{item.carrierName} · {item.serviceName} · {formatPrice(BigInt(item.amountMinor), item.currency)}</span></label>)}</fieldset>}
    {option?.pickupPoints && <><label htmlFor="checkout-point">Punto de retiro</label><select id="checkout-point" value={p.pointId} onChange={e => p.setPointId(e.target.value)} disabled={p.disabled}><option value="">Elegí un punto de retiro</option>{option.pickupPoints.map(point => <option key={point.id} value={point.id}>{point.description}</option>)}</select></>}
  </section>;
}
