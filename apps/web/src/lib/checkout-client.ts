import { parseLookup, type PostalCandidate } from './postal-lookup';

export type Destination = PostalCandidate;
export type DestinationResult = {status:'resolved';candidate:Destination}|{status:'ambiguous';candidates:Destination[]}|{status:'unavailable'|'invalid'|'not_found'|'too_many'};
export type ShippingOption = { id: string; carrierName: string; serviceName: string; serviceCode: string; amountMinor: string; currency: string; pickupPoints?: { id: number; description: string }[] };
export type Quote = { quoteId: string; validUntil: number; options: ShippingOption[] };
export type Order = { id: string; orderStatus: 'received'; paymentStatus: 'not_started'; fulfillmentStatus: 'not_started'; shippingStatus:'not_started'; testLocal: true; currency: string; totalMinor: string };
export type OrderInput = { quoteId: string; optionId: string; pickupPointId: number | null; contact: { name: string; email: string; phone: string }; address: { street: string; number: string; unit: string } };
export class CheckoutError extends Error { constructor(public status: number, public code?: string) { super(`Checkout request failed (${status})`); } }
async function post(url: string, body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    let code: string | undefined;
    if (response.status === 409 || response.status === 403 || response.status === 400) {
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && !Array.isArray(body) && 'code' in body && (body.code === 'QUOTE_CHANGED' || body.code === 'INVALID_DESTINATION' || body.code === 'CHECKOUT_SESSION_INVALID' || body.code === 'CHECKOUT_SESSION_CONFLICT')) code = body.code;
      } catch { /* An invalid response is not a confirmed rejection. */ }
    }
    throw new CheckoutError(response.status, code);
  }
  return response.json();
}
const object = (v:unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v:unknown, max=255): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const money = (v:unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d{0,15})$/.test(v) && BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER);
const currency = (v:unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const token = (v:unknown): string => { if (!object(v) || !text(v.csrf,1024)) throw new Error('Invalid session response'); return v.csrf; };
function validateOrder(v:unknown): Order { if (!object(v) || !text(v.id,128) || v.orderStatus !== 'received' || v.paymentStatus !== 'not_started' || v.fulfillmentStatus !== 'not_started' || v.shippingStatus !== 'not_started' || v.testLocal !== true || !currency(v.currency) || !money(v.totalMinor)) throw new Error('Invalid order response'); return v as Order; }
function validateQuote(v:unknown): Quote {
  if (!object(v) || !text(v.quoteId,128) || !Number.isSafeInteger(v.validUntil) || (v.validUntil as number) <= Date.now() || (v.validUntil as number) > Date.now() + 300000 || !Array.isArray(v.options) || v.options.length === 0 || v.options.length > 100) throw new Error('Invalid quote response');
  const ids = new Set<string>();
  for (const o of v.options) { if (!object(o) || !text(o.id,128) || ids.has(o.id) || !text(o.carrierName) || !text(o.serviceName) || !text(o.serviceCode) || !money(o.amountMinor) || !currency(o.currency)) throw new Error('Invalid option'); ids.add(o.id); if (o.serviceCode === 'pickup_point' && o.pickupPoints === undefined) throw new Error('Missing pickup points'); if (o.pickupPoints !== undefined && (!Array.isArray(o.pickupPoints) || o.pickupPoints.length === 0 || o.pickupPoints.length > 1000 || o.pickupPoints.some((p:unknown) => !object(p) || !Number.isSafeInteger(p.id) || (p.id as number) < 1 || !text(p.description)))) throw new Error('Invalid pickup points'); }
  return v as Quote;
}
let bootstrap: Promise<string> | null = null;
export function checkoutRecoveryAvailable(): boolean { return typeof navigator !== 'undefined' && !!navigator.locks; }
async function sessionLock<T>(action: () => Promise<T>): Promise<T> {
  return checkoutRecoveryAvailable() ? await navigator.locks.request('checkout:session', action) : await action();
}
export function checkoutSession(): Promise<string> { if (!bootstrap) bootstrap = sessionLock(() => post('/api/v1/checkout/session', {}).then(token)).catch(error => { bootstrap = null; throw error; }); return bootstrap; }
export function resetCheckoutSession() { bootstrap = null; }
export async function discardInvalidCheckoutSession(): Promise<void> {
  if (!checkoutRecoveryAvailable()) throw new Error('Cross-tab session protection unavailable');
  await sessionLock(async () => { await post('/api/v1/checkout/session/reset', {}); resetCheckoutSession(); });
}
export async function lookupDestination(postalCode: string, signal?: AbortSignal): Promise<DestinationResult> {
  const result = parseLookup(await post('/api/v1/shipping/destination', { postalCode }, {}, signal));
  if (result.status === 'resolved') return {status:'resolved',candidate:result.candidates[0]};
  if (result.status === 'ambiguous') return {status:'ambiguous',candidates:result.candidates};
  return {status:result.status};
}
export async function getQuote(csrf: string, lines: {productId:string;variantId:string;quantity:number}[], destination: {postalCode:string;candidateId:string}, signal?: AbortSignal) { return validateQuote(await post('/api/v1/checkout/quotes', { lines, destination }, { 'X-CSRF-Token': csrf }, signal)); }
export async function createOrder(csrf: string, key: string, input: OrderInput) { return validateOrder(await post('/api/v1/checkout/orders', input, { 'X-CSRF-Token': csrf, 'Idempotency-Key': key })); }
export async function resumeCheckoutSession() { return token(await post('/api/v1/checkout/session/resume', {})); }
export async function checkOrderAttempt(csrf: string, key: string): Promise<{status:'completed';order:Order}|{status:'unknown'}> { const v = await post('/api/v1/checkout/order-attempt', {}, { 'X-CSRF-Token':csrf, 'Idempotency-Key':key }); if (object(v) && v.status === 'unknown') return {status:'unknown'}; if (object(v) && v.status === 'completed') return {status:'completed',order:validateOrder(v.order)}; throw new Error('Invalid attempt response'); }
