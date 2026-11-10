import assert from 'node:assert/strict';
import { checkoutSession, resetCheckoutSession, discardInvalidCheckoutSession, createOrder, getQuote, lookupDestination, checkOrderAttempt } from '../../src/presentation/shared/checkout/checkout-client';
async function main() {
const json = (data: unknown) => new Response(JSON.stringify(data), {status:200});
let release!: (response:Response)=>void;
let calls: {url:string, init:RequestInit}[] = [];
globalThis.fetch = ((url:string, init:RequestInit) => {calls.push({url,init}); return new Promise<Response>(resolve=>{release=resolve;});}) as typeof fetch;
const a=checkoutSession(), b=checkoutSession();
assert.equal(calls.length,1); release(json({csrf:'token'})); assert.equal(await a,'token'); assert.equal(await b,'token');
resetCheckoutSession(); globalThis.fetch = (async()=>new Response('',{status:403})) as typeof fetch;
await assert.rejects(checkoutSession(), (e: {status:number})=>e.status===403);
let retryCount=0; globalThis.fetch = (async()=>{retryCount++; return json({csrf:'fresh'});}) as typeof fetch;
assert.equal(await checkoutSession(),'fresh'); assert.equal(retryCount,1);
calls=[]; globalThis.fetch = (async(url:string,init:RequestInit)=>{calls.push({url,init}); return json(url.endsWith('/orders') ? {id:'o',orderStatus:'received',paymentStatus:'not_started',fulfillmentStatus:'not_started',shippingStatus:'not_started',testLocal:true,currency:'ARS',totalMinor:'100'} : {quoteId:'q',validUntil:Date.now()+1000,options:[{id:'o',carrierName:'c',serviceName:'s',serviceCode:'home',amountMinor:'1',currency:'ARS'}]});}) as typeof fetch;
const input={quoteId:'q',optionId:'o',pickupPointId:null,contact:{name:'Private',email:'a@example.com',phone:'123'},address:{street:'Private',number:'1',unit:''}};
await createOrder('csrf','same-key',input); await createOrder('csrf','same-key',input);
assert.equal(calls.length,2); assert.equal(calls[0].init.body,calls[1].init.body); assert.equal((calls[0].init.headers as Record<string,string>)['Idempotency-Key'],(calls[1].init.headers as Record<string,string>)['Idempotency-Key']);
await getQuote('csrf',[{productId:'p',variantId:'v',quantity:1}],{postalCode:'1000',candidateId:'c'});
assert.deepEqual(JSON.parse(String(calls[2].init.body)),{lines:[{productId:'p',variantId:'v',quantity:1}],destination:{postalCode:'1000',candidateId:'c'}});
globalThis.fetch = (async()=>json({status:'unavailable'})) as typeof fetch;
assert.deepEqual(await lookupDestination('1000'), {status:'unavailable'});
const candidates = Array.from({length:1001}, (_, index) => ({id:String(index).padStart(24,'0'),label:'x'.repeat(303)}));
for (const count of [101,1000]) {
  const result = {status:'ambiguous',candidates:candidates.slice(0,count)};
  globalThis.fetch = (async()=>json(result)) as typeof fetch;
  assert.deepEqual(await lookupDestination('1000'),result);
}
globalThis.fetch = (async()=>json({status:'resolved',candidate:candidates[0]})) as typeof fetch;
assert.deepEqual(await lookupDestination('1000'),{status:'resolved',candidate:candidates[0]});
for (const value of [
  {status:'ambiguous',candidates},
  {status:'ambiguous',candidates:[candidates[0],candidates[0]]},
  {status:'ambiguous',candidates:[candidates[0],{...candidates[1],id:'bad'}]},
  {status:'resolved',candidate:{...candidates[0],label:'bad\nlabel'}},
  {status:'resolved',candidate:{...candidates[0],label:'x'.repeat(306)}},
]) {
  globalThis.fetch = (async()=>json(value)) as typeof fetch;
  await assert.rejects(lookupDestination('1000'));
}
globalThis.fetch = (async()=>json({quoteId:'q',validUntil:Date.now()+1000,options:[{id:'o',carrierName:'c',serviceName:'s',serviceCode:'home',currency:'ARS',amountMinor:'NaN'}]})) as typeof fetch;
await assert.rejects(getQuote('csrf',[],{postalCode:'1000',candidateId:'c'}));
for (const value of ['01','9007199254740992']) {
  globalThis.fetch = (async()=>json({quoteId:'q',validUntil:Date.now()+1000,options:[{id:'o',carrierName:'c',serviceName:'s',serviceCode:'home',currency:'ARS',amountMinor:value}]})) as typeof fetch;
  await assert.rejects(getQuote('csrf',[],{postalCode:'1000',candidateId:'c'}));
}
for (const value of [Date.now()-1, Date.now()+310000]) {
  globalThis.fetch = (async()=>json({quoteId:'q',validUntil:value,options:[{id:'o',carrierName:'c',serviceName:'s',serviceCode:'home',currency:'ARS',amountMinor:'1'}]})) as typeof fetch;
  await assert.rejects(getQuote('csrf',[],{postalCode:'1000',candidateId:'c'}));
}
globalThis.fetch = (async()=>json({quoteId:'q',validUntil:Date.now()+1000,options:[{id:'o',carrierName:'c',serviceName:'s',serviceCode:'pickup_point',currency:'ARS',amountMinor:'1',pickupPoints:[{id:0,description:'x'}]}]})) as typeof fetch;
await assert.rejects(getQuote('csrf',[],{postalCode:'1000',candidateId:'c'}));
globalThis.fetch = (async()=>json({quoteId:'q',validUntil:Date.now()+1000,options:[]})) as typeof fetch;
await assert.rejects(getQuote('csrf',[],{postalCode:'1000',candidateId:'c'}));
globalThis.fetch = (async()=>json({status:'completed',order:{id:'x',testLocal:true}})) as typeof fetch;
await assert.rejects(checkOrderAttempt('csrf','key'));
resetCheckoutSession(); globalThis.fetch = (async()=>json({csrf:''})) as typeof fetch;
await assert.rejects(checkoutSession());
// Reset and bootstrap from different tabs must serialize before a stale reset can erase a newer cookie.
let tail: Promise<unknown> = Promise.resolve(), state = 'stale', finishReset!: () => void;
Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{locks:{request:(_key:string, action:()=>Promise<unknown>) => { const next=tail.then(action); tail=next.catch(()=>undefined); return next; }}} });
const paths: string[] = [];
globalThis.fetch = (async (url:string) => {
  paths.push(url);
  if (url.endsWith('/session/reset')) {
    if (state==='valid') return new Response('',{status:409});
    await new Promise<void>(resolve => {finishReset=resolve;}); state='none'; return json({});
  }
  state='valid'; return json({csrf:'new'});
}) as typeof fetch;
resetCheckoutSession();
const firstReset=discardInvalidCheckoutSession();
await new Promise<void>(resolve=>setImmediate(resolve));
const nextSession=checkoutSession(), lateReset=discardInvalidCheckoutSession();
assert.deepEqual(paths,['/api/v1/checkout/session/reset']);
finishReset(); await firstReset; assert.equal(await nextSession,'new'); await assert.rejects(lateReset, {status:409});
assert.deepEqual(paths,['/api/v1/checkout/session/reset','/api/v1/checkout/session','/api/v1/checkout/session/reset']);
Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{} });
await assert.rejects(discardInvalidCheckoutSession(), /Cross-tab session protection unavailable/);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
