'use client';

import { useId } from 'react';
import { formatPrice } from '../lib/cart';
import { useShipping } from './ShippingProvider';

export function ShippingEstimate({ mode, coherent, unresolved }: { mode:'api'|'demo'; coherent:boolean; unresolved:boolean }) {
  const id=useId(), {session,snapshot}=useShipping();
  const postalId=`${id}-postal`, cityId=`${id}-city`, errorId=`${id}-postal-error`;
  const code=snapshot.postalCode.trim(), invalid=!!code && !/^\d{4}$/.test(code);
  const quote=coherent ? snapshot.quote : null;
  const selection=coherent ? snapshot.selection : null;
  const lookup=snapshot.lookup;
  const retry=coherent && (snapshot.error || snapshot.expired || lookup.status === 'unavailable' || quote?.status === 'unavailable');
  return <section className="shipping-estimate" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Envío estimado</h2>
    <p>{mode === 'demo' ? 'El cálculo no está disponible en el modo de demostración.' : 'Ingresá tu código postal para calcular el envío.'}</p>
    <label htmlFor={postalId}>Código postal</label>
    <div className="shipping-controls"><input id={postalId} autoComplete="postal-code" inputMode="numeric" maxLength={16} value={snapshot.postalCode} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={event => session.setPostalCode(event.target.value)} /></div>
    {invalid && <p id={errorId} role="alert">Ingresá los cuatro números de tu código postal.</p>}
    <div aria-live="polite">
      {unresolved && <p>Esperá a que se verifiquen los artículos del carrito.</p>}
      {mode === 'api' && coherent && lookup.status === 'loading' && <p>Buscando localidades…</p>}
      {mode === 'api' && coherent && lookup.status === 'resolved' && <p>Destino: {lookup.candidates[0].label}</p>}
      {mode === 'api' && coherent && lookup.status === 'ambiguous' && <div><label htmlFor={cityId}>Localidad</label><div className="shipping-controls"><select id={cityId} value={snapshot.candidateId ?? ''} onChange={event => session.selectDestination(event.target.value)}><option value="">Elegí tu localidad</option>{lookup.candidates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><p>Este código corresponde a más de una localidad o barrio.</p></div>}
      {mode === 'api' && coherent && lookup.status === 'not_found' && <p>No encontramos localidades para ese código postal. Revisalo e intentá de nuevo.</p>}
      {mode === 'api' && coherent && lookup.status === 'too_many' && <p>Hay demasiadas localidades para este código. No podemos calcular el envío por ahora.</p>}
      {mode === 'api' && coherent && lookup.status === 'unavailable' && <p>No pudimos consultar las localidades en este momento.</p>}
      {coherent && snapshot.loading && <p>Consultando envío…</p>}
      {coherent && snapshot.error && <p>No se pudo consultar el envío. Intentá más tarde.</p>}
      {coherent && snapshot.expired && <p>La cotización venció. Volvé a calcular el envío.</p>}
      {quote?.status === 'unavailable' && <p>{quote.reason === 'NO_OPTIONS' ? 'No hay opciones disponibles para este destino.' : 'El cálculo de envío no está disponible por el momento.'}</p>}
      {retry && <div className="shipping-controls"><button type="button" onClick={() => session.retry()}>Actualizar envío</button></div>}
      {quote?.status === 'quoted' && <><p>Calculado en {quote.packageCount} bulto{quote.packageCount === 1 ? '' : 's'}.</p>
        <fieldset><legend>Opciones de entrega</legend>{quote.options.flatMap((option,index) => {
          const choices=option.pickupPoints?.length ? option.pickupPoints.map(point => ({key:`${index}:${point.id}`,label:point.description,pointId:point.id})) : [{key:`${index}`,label:option.serviceName,pointId:undefined}];
          return choices.map(choice => <label key={choice.key}><input type="radio" name={`${id}-shipping-option`} value={choice.key} checked={selection?.choiceKey === choice.key} onChange={() => session.select(index,choice.pointId)} /> {option.carrierName} · {choice.label} · {formatPrice(BigInt(option.amountMinor),option.currency)}</label>);
        })}</fieldset>{selection && <p>Selección estimada; el pago todavía no está disponible.</p>}</>}
    </div>
  </section>;
}
