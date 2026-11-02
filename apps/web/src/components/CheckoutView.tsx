'use client';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '../hooks/useCart';
import { formatPrice } from '../lib/cart';
import { checkoutSession, resetCheckoutSession, discardInvalidCheckoutSession, checkoutRecoveryAvailable, getQuote, createOrder, resumeCheckoutSession, checkOrderAttempt, CheckoutError, type Quote, type Order, type OrderInput } from '../lib/checkout-client';
import { shippingCartKey } from '../lib/shipping-session';
import { useShipping } from './ShippingProvider';
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
    const { session, snapshot } = useShipping();
    const [open, setOpen] = useState(false);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [expired, setExpired] = useState(false);
    const [option, setOption] = useState('');
    const [point, setPoint] = useState('');
    const [quoteBusy, setQuoteBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [invalidSession, setInvalidSession] = useState(false);
    const [order, setOrder] = useState<Order | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [focusRequest, setFocusRequest] = useState(0);
    const errorRef = useRef<HTMLParagraphElement>(null);
    const pendingRef = useRef<HTMLDivElement>(null);
    const focusCriticalStatus = () => setFocusRequest(value => value + 1);
    const attempt = useRef<OrderInput | null>(null);
    const attemptCsrf = useRef<string | null>(null);
    const revision = useRef(0);
    const quotedDestination = useRef<string | null>(null);
    const quotedCart = useRef<string | null>(null);
    const [contact, setContact] = useState({ name: '', email: '', phone: '' });
    const [address, setAddress] = useState({ street: '', number: '', unit: '' });
    const lines = cart.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
    const signature = JSON.stringify(lines);
    const currentCartSignature = useRef(signature);
    currentCartSignature.current = signature;
    const totalsKey = JSON.stringify(Object.entries(cart.totals).map(([currency, amount]) => [currency, amount.toString()]).sort());
    const cartKey = shippingCartKey('api', lines, cart.unresolved, totalsKey);
    const destinationKey = (value: typeof snapshot) => JSON.stringify([value.mode, value.postalCode.trim(), value.candidateId]);
    const currentDestination = destinationKey(snapshot);
    const postal = snapshot.mode === 'api' ? snapshot.postalCode : '';
    const destinations = snapshot.mode === 'api' && (snapshot.lookup.status === 'resolved' || snapshot.lookup.status === 'ambiguous') ? snapshot.lookup.candidates : [];
    const candidate = destinations.some(item => item.id === snapshot.candidateId) ? snapshot.candidateId! : '';
    useEffect(() => { session.setEstimateEnabled(false); return () => session.setEstimateEnabled(true); }, [session]);
    useEffect(() => { if (cart.ready) session.syncCart('api', lines, cart.unresolved, totalsKey); }, [session, cart.ready, cartKey]);
    useEffect(() => { try {
        const savedPending = sessionStorage.getItem(pendingKey);
        setPending(savedPending);
        if (savedPending) focusCriticalStatus();
    }
    catch {
        setError('No está disponible el almacenamiento de sesión. No se puede iniciar un pedido de forma segura.');
            focusCriticalStatus();
    } setLoaded(true); }, []);
    useEffect(() => {
        if (focusRequest) (errorRef.current ?? pendingRef.current)?.focus();
    }, [focusRequest]);
    useEffect(() => {
        revision.current++;
        setQuote(null);
        setOption('');
        setPoint('');
        setQuoteBusy(false);
    }, [signature]);
    useEffect(() => {
        revision.current++;
        quotedDestination.current = null;
        setQuote(null); setOption(''); setPoint(''); setQuoteBusy(false);
    }, [currentDestination]);
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
        setQuoteBusy(false);
    };
    const findDestination = () => { invalidate(); setError(''); setInvalidSession(false); void session.lookup(); };
    const quoteRequest = async () => {
        const current = ++revision.current;
        setQuote(null);
        setOption('');
        setPoint('');
        setError('');
        setInvalidSession(false);
        setQuoteBusy(true);
        try {
            const csrf = await checkoutSession();
            const result = await getQuote(csrf, lines, { postalCode: postal.trim(), candidateId: candidate });
            if (current === revision.current && currentCartSignature.current === signature && destinationKey(session.getSnapshot()) === currentDestination) {
                quotedDestination.current = currentDestination;
                quotedCart.current = signature;
                setQuote(result);
            }
        }
        catch (cause) {
            if (current === revision.current) {
                resetCheckoutSession();
                const invalid = cause instanceof CheckoutError && cause.status === 403 && cause.code === 'CHECKOUT_SESSION_INVALID';
                const conflicting = cause instanceof CheckoutError && cause.status === 403 && cause.code === 'CHECKOUT_SESSION_CONFLICT';
                const invalidDestination = cause instanceof CheckoutError && cause.status === 400 && cause.code === 'INVALID_DESTINATION';
                if (invalidDestination) session.invalidateDestination();
                setInvalidSession(invalid);
                setError(invalidDestination ? 'La localidad necesita verificarse nuevamente. Buscala otra vez para continuar.' : invalid ? 'La sesión de compra ya no está disponible.' : conflicting ? 'El navegador conserva sesiones de compra incompatibles. Si hay un pedido incierto, no elimines datos y consultá al administrador. De lo contrario, eliminá solo las cookies store_checkout desde la configuración del navegador.' : 'No pudimos obtener la cotización. Revisá la sesión y volvé a intentar.');
                focusCriticalStatus();
            }
        }
        finally {
            if (current === revision.current)
                setQuoteBusy(false);
        }
    };
    const discardSession = async () => {
        if (pending || attempt.current || quoteBusy) return;
        setQuoteBusy(true);
        try {
            await discardInvalidCheckoutSession();
            setInvalidSession(false);
            setError('Sesión anterior cerrada. Consultá las opciones de entrega nuevamente.');
        } catch {
            setError('No pudimos cerrar la sesión anterior. Intentá nuevamente.');
        } finally { setQuoteBusy(false); focusCriticalStatus(); }
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
            focusCriticalStatus();
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
        if (!quote || quotedCart.current !== currentCartSignature.current || quotedDestination.current !== destinationKey(session.getSnapshot()) || !option || pending || attempt.current || sending || cart.unresolved || Date.now() >= quote.validUntil) {
            if (quote && Date.now() >= quote.validUntil) {
                invalidate();
                setError('La cotización venció. Consultá las opciones nuevamente.');
                focusCriticalStatus();
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
            focusCriticalStatus();
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
            if (result.status !== 'completed') focusCriticalStatus();
        }
        catch {
            setError('No pudimos recuperar el estado con la sesión original. El intento sigue pendiente; consultá al administrador.');
            focusCriticalStatus();
        }
        finally {
            setSending(false);
        }
    };
    const locked = !!pending || sending || !!order;
    const validQuote = quotedDestination.current === currentDestination && quotedCart.current === signature ? quote : null;
    const selected = validQuote?.options.find(item => item.id === option);
    return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <div className="listing-header"><Header brand={brand} demo={false} count={cart.count} onCartOpen={() => setOpen(true)}/></div>
    <main id="contenido" className="checkout-page section-wrap">
      <nav className="breadcrumb" aria-label="Ubicación"><a href="/">Inicio</a> / <a href="/carrito">Carrito</a> / Checkout</nav>
      <p className="eyebrow">PRUEBA LOCAL</p>
      <h1>Finalizar prueba</h1>
      <p>Esta es una prueba local. No se inicia ningún pago ni se crea un envío.</p>
      {error && <div className="checkout-alert"><p role="alert" ref={errorRef} tabIndex={-1}>{error}</p>
        {invalidSession && !pending && <><p>Si otro intento tiene resultado incierto, no reinicies la sesión; consultá al administrador.</p>{checkoutRecoveryAvailable() ? <button type="button" disabled={quoteBusy} onClick={() => void discardSession()}>Reiniciar sesión de compra</button> : <p>Este navegador no permite reiniciar la sesión de forma segura. Consultá al administrador.</p>}</>}
      </div>}
      {order ? <section className="checkout-section" role="status">
        <h2>Pedido de prueba recibido</h2><p>Referencia: {order.id}</p>
        <p>Total: {formatPrice(BigInt(order.totalMinor), order.currency)}</p>
        <p>Pago no iniciado. Envío no iniciado.</p><a href="/catalogo">Volver al catálogo</a>
      </section> : <>
        {pending && <div className="checkout-alert" role="alert" ref={pendingRef} tabIndex={-1}>
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
              <CheckoutShipping postalCode={postal} setPostalCode={value => { session.setPostalCode(value); invalidate(); }} lookup={findDestination} lookupBusy={snapshot.lookup.status === 'loading'} lookupStatus={snapshot.lookup.status} destinations={destinations} candidateId={candidate} setCandidateId={value => { session.selectDestination(value); invalidate(); }} quote={expired ? null : validQuote} quoteBusy={quoteBusy} requestQuote={quoteRequest} optionId={option} setOptionId={value => {
                        setOption(value);
                        setPoint('');
                    }} pointId={point} setPointId={setPoint} disabled={locked || cart.unresolved}/>
              {expired && <p role="status">La cotización venció. Consultá las opciones nuevamente.</p>}
            </div>
            <CheckoutSummary cart={cart} selected={selected} valid={!!validQuote && !expired && Date.now() < validQuote.validUntil} pickupReady={!selected?.pickupPoints || !!point} disabled={!loaded || locked || cart.unresolved || !validQuote || expired || !option || !!(selected?.pickupPoints && !point)} sending={sending}/>
          </div></form>}
      </>}
    </main>
    <CartDialog open={open && !locked} onClose={() => setOpen(false)} cart={cart} demo={false}/>
  </>;
}
