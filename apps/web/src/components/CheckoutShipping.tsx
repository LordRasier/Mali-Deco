'use client';
import { formatPrice } from '../lib/cart';
import type { Destination, Quote } from '../lib/checkout-client';

type Props = { postalCode:string; setPostalCode:(value:string)=>void; lookup:()=>void; lookupBusy:boolean; destinations:Destination[]; candidateId:string; setCandidateId:(value:string)=>void; quote:Quote|null; quoteBusy:boolean; requestQuote:()=>void; optionId:string; setOptionId:(value:string)=>void; pointId:string; setPointId:(value:string)=>void; disabled:boolean };
export function CheckoutShipping(p: Props) {
  const option = p.quote?.options.find(item => item.id === p.optionId);
  return <section className="checkout-section"><h2>Entrega</h2>
    <label htmlFor="checkout-postal">Código postal</label><div className="checkout-inline"><input id="checkout-postal" inputMode="numeric" autoComplete="postal-code" value={p.postalCode} onChange={e => p.setPostalCode(e.target.value)} disabled={p.disabled} /><button type="button" onClick={p.lookup} disabled={p.disabled || p.lookupBusy || !/^\d{4}$/.test(p.postalCode.trim())}>{p.lookupBusy ? 'Buscando…' : 'Buscar localidad'}</button></div>
    {p.destinations.length > 0 && <><label htmlFor="checkout-destination">Localidad</label><select id="checkout-destination" value={p.candidateId} onChange={e => p.setCandidateId(e.target.value)} disabled={p.disabled}><option value="">Elegí una localidad</option>{p.destinations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></>}
    <button type="button" onClick={p.requestQuote} disabled={p.disabled || p.quoteBusy || !p.candidateId}>{p.quoteBusy ? 'Consultando…' : 'Consultar opciones'}</button>
    {p.quote && <fieldset><legend>Elegí una opción de entrega</legend>{p.quote.options.length === 0 && <p>No hay opciones disponibles para este destino.</p>}{p.quote.options.map(item => <label className="checkout-choice" key={item.id}><input type="radio" name="delivery" value={item.id} checked={p.optionId === item.id} onChange={() => p.setOptionId(item.id)} disabled={p.disabled} /> <span>{item.carrierName} · {item.serviceName} · {formatPrice(BigInt(item.amountMinor), item.currency)}</span></label>)}</fieldset>}
    {option?.pickupPoints && <><label htmlFor="checkout-point">Punto de retiro</label><select id="checkout-point" value={p.pointId} onChange={e => p.setPointId(e.target.value)} disabled={p.disabled}><option value="">Elegí un punto de retiro</option>{option.pickupPoints.map(point => <option key={point.id} value={point.id}>{point.description}</option>)}</select></>}
  </section>;
}
