'use client';

import { useId } from 'react';
import { formatPrice } from '../lib/cart';
import { invalidPostalCode, type cheapestShipping } from '../lib/shipping-client';
import { useShipping } from './ShippingProvider';

export function ShippingEstimate({ mode, coherent, unresolved, compact = false, automatic = null }: { mode:'api'|'demo'; coherent:boolean; unresolved:boolean; compact?:boolean; automatic?:ReturnType<typeof cheapestShipping> }) {
  const id=useId(), {session,snapshot}=useShipping();
  const postalId=`${id}-postal`, cityId=`${id}-city`, errorId=`${id}-postal-error`;
  const code=snapshot.postalCode.trim(), invalid=invalidPostalCode(code);
  const quote=coherent ? snapshot.quote : null;
  const selection=coherent ? snapshot.selection : null;
  const lookup=snapshot.lookup;
  const retry=coherent && (snapshot.error || snapshot.expired || lookup.status === 'unavailable' || lookup.status === 'needs_lookup' || quote?.status === 'unavailable');
  const busy=mode === 'api' && coherent && !unresolved && !snapshot.error && !snapshot.expired && !quote && /^\d{4}$/.test(code) && (lookup.status === 'idle' || lookup.status === 'loading' || snapshot.loading || (snapshot.estimateEnabled && !!snapshot.candidateId));
  return <section className={`shipping-estimate${compact ? ' shipping-estimate-compact' : ''}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={compact ? 'sr-only' : undefined}>Envío estimado</h2>
    {(!compact || mode === 'demo') && <p>{mode === 'demo' ? 'El cálculo no está disponible en el modo de demostración.' : 'Ingresá tu código postal para calcular el envío.'}</p>}
    <label htmlFor={postalId}>Código postal</label>
    <div className="shipping-controls" aria-busy={busy}><input className={busy ? 'shipping-input-busy' : undefined} id={postalId} autoComplete="postal-code" inputMode="numeric" maxLength={16} value={snapshot.postalCode} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={event => session.setPostalCode(event.target.value)} /></div>
    {busy && <span className="sr-only" role="status">Actualizando envío</span>}
    {invalid && <p id={errorId} role="alert">Ingresá los cuatro números de tu código postal.</p>}
    <div aria-live="polite">
      {unresolved && <p>Esperá a que se verifiquen los artículos del carrito.</p>}
      {mode === 'api' && coherent && !snapshot.estimateEnabled && snapshot.candidateId && !quote && <p>La entrega se confirma en el checkout.</p>}
      {!compact && mode === 'api' && coherent && lookup.status === 'loading' && <p>Buscando localidades…</p>}
      {!compact && mode === 'api' && coherent && lookup.status === 'resolved' && <p>Destino: {lookup.candidates[0].label}</p>}
      {mode === 'api' && coherent && lookup.status === 'ambiguous' && <div><label htmlFor={cityId}>Localidad</label><div className="shipping-controls"><select id={cityId} value={snapshot.candidateId ?? ''} onChange={event => session.selectDestination(event.target.value)}><option value="">Elegí tu localidad</option>{lookup.candidates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>{!compact && <p>Este código corresponde a más de una localidad o barrio.</p>}</div>}
      {mode === 'api' && coherent && lookup.status === 'not_found' && <p>No encontramos localidades para ese código postal. Revisalo e intentá de nuevo.</p>}
      {mode === 'api' && coherent && lookup.status === 'too_many' && <p>Hay demasiadas localidades para este código. No podemos calcular el envío por ahora.</p>}
      {mode === 'api' && coherent && lookup.status === 'unavailable' && <p>No pudimos consultar las localidades en este momento.</p>}
      {mode === 'api' && coherent && lookup.status === 'needs_lookup' && <p>Volvé a buscar la localidad para continuar.</p>}
      {!compact && coherent && snapshot.loading && <p>Consultando envío…</p>}
      {coherent && snapshot.error && <p>No se pudo consultar el envío. Intentá más tarde.</p>}
      {coherent && snapshot.expired && <p>La cotización venció. Volvé a calcular el envío.</p>}
      {quote?.status === 'unavailable' && <p>{quote.reason === 'NO_OPTIONS' ? 'No hay opciones disponibles para este destino.' : 'El cálculo de envío no está disponible por el momento.'}</p>}
      {retry && <div className="shipping-controls"><button type="button" onClick={() => session.retry()}>Actualizar envío</button></div>}
      {!compact && quote?.status === 'quoted' && <><p>Calculado en {quote.packageCount} bulto{quote.packageCount === 1 ? '' : 's'}.</p>
        {!selection && automatic?.requiresPickup && <p>El envío estimado más económico requiere elegir una sucursal.</p>}
        <fieldset><legend>Opciones de entrega</legend>{quote.options.flatMap((option,index) => {
          const choices=option.pickupPoints?.length ? option.pickupPoints.map(point => ({key:`${index}:${point.id}`,label:point.description,pointId:point.id})) : [{key:`${index}`,label:option.serviceName,pointId:undefined}];
          return choices.map(choice => <label key={choice.key}><input type="radio" name={`${id}-shipping-option`} value={choice.key} checked={(selection?.choiceKey ?? automatic?.choiceKey) === choice.key} onChange={() => session.select(index,choice.pointId)} /> {option.carrierName} · {choice.label} · {formatPrice(BigInt(option.amountMinor),option.currency)}</label>);
        })}</fieldset>{selection && <p>Selección estimada; el pago todavía no está disponible.</p>}</>}
    </div>
  </section>;
}
