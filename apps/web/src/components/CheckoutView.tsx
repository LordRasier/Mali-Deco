'use client';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '../hooks/useCart';
import { formatPrice } from '../lib/cart';
import { checkoutSession, resetCheckoutSession, lookupDestination, getQuote, createOrder, resumeCheckoutSession, checkOrderAttempt, CheckoutError, type Destination, type Quote, type Order, type OrderInput } from '../lib/checkout-client';
import { CheckoutShipping } from './CheckoutShipping';
import { CheckoutContact } from './CheckoutContact';
import { CheckoutSummary } from './CheckoutSummary';
import { Header } from './Header';
import { CartDialog } from './CartDialog';
const pendingKey = 'checkout-local-pending-v1';
export default function CheckoutView({ brand }: {
    brand: string;
}) {
    const cart = useCart('api');
    const [open, setOpen] = useState(false);
    const [postal, setPostal] = useState('');
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [candidate, setCandidate] = useState('');
    const [quote, setQuote] = useState<Quote | null>(null);
    const [expired, setExpired] = useState(false);
    const [option, setOption] = useState('');
    const [point, setPoint] = useState('');
    const [lookupBusy, setLookupBusy] = useState(false);
    const [quoteBusy, setQuoteBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [order, setOrder] = useState<Order | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const attempt = useRef<OrderInput | null>(null);
    const attemptCsrf = useRef<string | null>(null);
    const revision = useRef(0);
    const [contact, setContact] = useState({ name: '', email: '', phone: '' });
    const [address, setAddress] = useState({ street: '', number: '', unit: '' });
    const lines = cart.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
    const signature = JSON.stringify(lines);
    useEffect(() => { try {
        setPending(sessionStorage.getItem(pendingKey));
    }
    catch {
        setError('No está disponible el almacenamiento de sesión. No se puede iniciar un pedido de forma segura.');
    } setLoaded(true); }, []);
    useEffect(() => {
        revision.current++;
        setQuote(null);
        setOption('');
        setPoint('');
        setLookupBusy(false);
        setQuoteBusy(false);
    }, [signature]);
    useEffect(() => {
        if (!quote) {
            setExpired(false);
            return;
        }
        const expire = () => setExpired(Date.now() >= quote.validUntil);
        expire();
        const timer = setTimeout(expire, Math.max(0, Math.min(quote.validUntil - Date.now(), 2147483647)));
        return () => clearTimeout(timer);
    }, [quote]);
    const invalidate = () => {
        revision.current++;
        setQuote(null);
        setOption('');
        setPoint('');
        setLookupBusy(false);
        setQuoteBusy(false);
    };
    const findDestination = async () => {
        const current = ++revision.current;
        setDestinations([]);
        setCandidate('');
        setQuote(null);
        setOption('');
        setPoint('');
        setError('');
        setLookupBusy(true);
        try {
            const result = await lookupDestination(postal.trim());
            if (current !== revision.current)
                return;
            const choices = result.status === 'resolved' ? [result.candidate] : result.status === 'ambiguous' ? result.candidates : [];
            setDestinations(choices);
            if (result.status === 'resolved')
                setCandidate(result.candidate.id);
            if (result.status === 'not_found')
                setError('No encontramos localidades para ese código postal.');
            if (result.status === 'invalid')
                setError('El código postal no es válido.');
            if (result.status === 'too_many')
                setError('Hay demasiadas localidades para ese código postal.');
            if (result.status === 'unavailable')
                setError('La consulta de localidades no está disponible. Intentá nuevamente.');
        }
        catch {
            if (current === revision.current)
                setError('No pudimos buscar la localidad. Intentá nuevamente.');
        }
        finally {
            if (current === revision.current)
                setLookupBusy(false);
        }
    };
    const quoteRequest = async () => {
        const current = ++revision.current;
        setQuote(null);
        setOption('');
        setPoint('');
        setError('');
        setQuoteBusy(true);
        try {
            const csrf = await checkoutSession();
            const result = await getQuote(csrf, lines, { postalCode: postal.trim(), candidateId: candidate });
            if (current === revision.current)
                setQuote(result);
        }
        catch {
            if (current === revision.current) {
                resetCheckoutSession();
                setError('No pudimos obtener la cotización. Revisá la sesión y volvé a intentar.');
            }
        }
        finally {
            if (current === revision.current)
                setQuoteBusy(false);
        }
    };
    const submit = async (input: OrderInput, key: string) => {
        setSending(true);
        setError('');
        let started = !!attemptCsrf.current;
        const previousAttempt = started;
        try {
            const csrf = attemptCsrf.current ?? await checkoutSession();
            attemptCsrf.current = csrf;
            started = true;
            const result = await createOrder(csrf, key, input);
            setOrder(result);
            try {
                sessionStorage.removeItem(pendingKey);
            }
            catch { /* The result is known; storage may be unavailable. */ }
            setPending(null);
            attempt.current = null;
            attemptCsrf.current = null;
        }
        catch (error) {
            const changedQuote = !previousAttempt && error instanceof CheckoutError && error.status === 409 && error.code === 'QUOTE_CHANGED';
            if (!started || (!previousAttempt && error instanceof CheckoutError && error.status === 400) || changedQuote) {
                try {
                    sessionStorage.removeItem(pendingKey);
                }
                catch { /* The result is known; storage may be unavailable. */ }
                setPending(null);
                attempt.current = null;
                attemptCsrf.current = null;
                if (!started)
                    resetCheckoutSession();
                if (changedQuote) invalidate();
                setError(changedQuote ? 'La cotización cambió o venció. Consultá las opciones nuevamente.' : !started ? 'No pudimos iniciar la sesión. Intentá nuevamente.' : 'El pedido fue rechazado. Revisá los datos e intentá nuevamente.');
            }
            else
                setError('No pudimos confirmar el resultado del pedido. No inicies otro: reintentá este mismo intento.');
        }
        finally {
            setSending(false);
        }
    };
    const start = (event: React.FormEvent) => {
        event.preventDefault();
        if (!quote || !option || pending || attempt.current || sending || cart.unresolved || Date.now() >= quote.validUntil) {
            if (quote && Date.now() >= quote.validUntil) {
                invalidate();
                setError('La cotización venció. Consultá las opciones nuevamente.');
            }
            return;
        }
        const selected = quote.options.find(item => item.id === option);
        if (!selected || (selected.pickupPoints && !selected.pickupPoints.some(item => String(item.id) === point)))
            return;
        const input = { quoteId: quote.quoteId, optionId: option, pickupPointId: selected.pickupPoints ? Number(point) : null, contact: { ...contact }, address: { ...address } };
        const key = crypto.randomUUID();
        try {
            sessionStorage.setItem(pendingKey, key);
        }
        catch {
            setError('No está disponible el almacenamiento de sesión. No se puede iniciar un pedido de forma segura.');
            return;
        }
        attempt.current = input;
        setPending(key);
        void submit(input, key);
    };
    const checkPending = async () => {
        if (!pending || sending)
            return;
        setSending(true);
        setError('');
        try {
            const csrf = await resumeCheckoutSession();
            const result = await checkOrderAttempt(csrf, pending);
            if (result.status === 'completed') {
                setOrder(result.order);
                sessionStorage.removeItem(pendingKey);
                setPending(null);
                attempt.current = null;
                attemptCsrf.current = null;
            }
            else
                setError('El resultado todavía no está disponible. El intento sigue pendiente; no inicies otro pedido.');
        }
        catch {
            setError('No pudimos recuperar el estado con la sesión original. El intento sigue pendiente; consultá al administrador.');
        }
        finally {
            setSending(false);
        }
    };
    const locked = !!pending || sending || !!order;
    const selected = quote?.options.find(item => item.id === option);
    return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <div className="listing-header"><Header brand={brand} demo={false} count={cart.count} onCartOpen={() => setOpen(true)}/></div>
    <main id="contenido" className="checkout-page section-wrap">
      <nav className="breadcrumb" aria-label="Ubicación"><a href="/">Inicio</a> / <a href="/carrito">Carrito</a> / Checkout</nav>
      <p className="eyebrow">PRUEBA LOCAL</p>
      <h1>Finalizar prueba</h1>
      <p>Esta es una prueba local. No se inicia ningún pago ni se crea un envío.</p>
      {error && <p className="checkout-alert" role="alert">{error}</p>}
      {order ? <section className="checkout-section" role="status">
        <h2>Pedido de prueba recibido</h2><p>Referencia: {order.id}</p>
        <p>Total: {formatPrice(BigInt(order.totalMinor), order.currency)}</p>
        <p>Pago no iniciado. Envío no iniciado.</p><a href="/catalogo">Volver al catálogo</a>
      </section> : <>
        {pending && <div className="checkout-alert" role="alert">
          <p>Hay un intento con resultado incierto. No crees otro pedido hasta resolverlo.</p>
          {attempt.current
                    ? <button type="button" disabled={sending} onClick={() => void submit(attempt.current!, pending)}>{sending ? 'Consultando…' : 'Reintentar el mismo intento'}</button>
                    : <button type="button" disabled={sending} onClick={() => void checkPending()}>{sending ? 'Consultando…' : 'Consultar estado del intento'}</button>}
        </div>}
        {!cart.ready ? <p role="status">Cargando carrito…</p> : !cart.items.length
                ? <p>Tu carrito está vacío. <a href="/catalogo">Ver catálogo</a></p>
                : <form onSubmit={start}><div className="checkout-grid">
            <div>
              <CheckoutContact contact={contact} address={address} setContact={setContact} setAddress={setAddress} disabled={locked}/>
              <CheckoutShipping postalCode={postal} setPostalCode={value => {
                        setPostal(value);
                        setDestinations([]);
                        setCandidate('');
                        invalidate();
                    }} lookup={findDestination} lookupBusy={lookupBusy} destinations={destinations} candidateId={candidate} setCandidateId={value => { setCandidate(value); invalidate(); }} quote={expired ? null : quote} quoteBusy={quoteBusy} requestQuote={quoteRequest} optionId={option} setOptionId={value => {
                        setOption(value);
                        setPoint('');
                    }} pointId={point} setPointId={setPoint} disabled={locked || cart.unresolved}/>
              {expired && <p role="status">La cotización venció. Consultá las opciones nuevamente.</p>}
            </div>
            <CheckoutSummary cart={cart} selected={selected} valid={!!quote && !expired && Date.now() < quote.validUntil} pickupReady={!selected?.pickupPoints || !!point} disabled={!loaded || locked || cart.unresolved || !quote || expired || !option || !!(selected?.pickupPoints && !point)} sending={sending}/>
          </div></form>}
      </>}
    </main>
    <CartDialog open={open && !locked} onClose={() => setOpen(false)} cart={cart} demo={false}/>
  </>;
}
