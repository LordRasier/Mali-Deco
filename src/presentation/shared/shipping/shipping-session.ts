import { parseLookup, type PostalCandidate } from './postal-lookup';
export type { PostalCandidate } from './postal-lookup';
import { parseShippingResult, type QuoteLine, type SelectedShipping, type ShippingResult } from './shipping-client';

type LookupStatus = 'idle' | 'loading' | 'resolved' | 'ambiguous' | 'invalid' | 'not_found' | 'too_many' | 'unavailable' | 'needs_lookup';
type Lookup = { status:LookupStatus; candidates:PostalCandidate[] };
type ShippingSelection = { choiceKey:string; shipping:SelectedShipping };
export type ShippingSnapshot = { mode:'api'|'demo'|null; cartKey:string | null; postalCode:string; lookup:Lookup; candidateId:string | null; quote:ShippingResult | null; selection:ShippingSelection | null; loading:boolean; error:boolean; expired:boolean; estimateEnabled:boolean };

export function readSavedPostalCode(raw:string | null): string | null { return raw !== null && raw.length <= 16 ? raw : null; }
/** The stored hint is never trusted until the current lookup contains the exact ID. */
export function readSavedDestinationHint(raw:string | null): {postalCode:string;candidateId:string} | null {
  if (!raw || raw.length > 100) return null;
  try {
    const value:unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string,unknown>;
    return typeof item.postalCode === 'string' && /^\d{4}$/.test(item.postalCode) && typeof item.candidateId === 'string' && /^[A-Za-z0-9_-]{24}$/.test(item.candidateId) ? {postalCode:item.postalCode,candidateId:item.candidateId} : null;
  } catch { return null; }
}
export function shippingCartKey(mode:'api'|'demo', lines:QuoteLine[], unresolved:boolean, totalsKey=''): string { return JSON.stringify([mode,unresolved,lines.map(line => [line.productId,line.variantId,line.quantity]),totalsKey]); }
/** One destination/quote controller shared by all cart views in the current tab. */
export class ShippingSession {
  private state:ShippingSnapshot = {mode:null,cartKey:null,postalCode:'',lookup:{status:'idle',candidates:[]},candidateId:null,quote:null,selection:null,loading:false,error:false,expired:false,estimateEnabled:true};
  private listeners = new Set<() => void>();
  private lookupRequest:AbortController | null = null;
  private quoteRequest:AbortController | null = null;
  private debounce:ReturnType<typeof setTimeout> | null = null;
  private expiry:ReturnType<typeof setTimeout> | null = null;
  private mode:'api' | 'demo' = 'demo';
  private lines:QuoteLine[] = [];
  private unresolved = true;
  private cartKey:string | null = null;
  private lineKey:string | null = null;
  private destinationHint: {postalCode:string;candidateId:string} | null = null;
  private active = true;
  private generation = 0;
  constructor(private readonly request:typeof fetch = (...args) => fetch(...args), private readonly now:() => number = Date.now) {}
  getSnapshot = () => this.state;
  subscribe = (listener:() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch:Partial<ShippingSnapshot>) { this.state={...this.state,...patch}; this.listeners.forEach(listener => listener()); }
  private cancel() {
    this.lookupRequest?.abort(); this.lookupRequest=null; this.quoteRequest?.abort(); this.quoteRequest=null;
    if (this.debounce) clearTimeout(this.debounce); this.debounce=null;
    if (this.expiry) clearTimeout(this.expiry); this.expiry=null;
  }
  private schedule() {
    if (!this.active || this.mode !== 'api' || this.unresolved || !this.lines.length || this.state.quote || this.state.loading || this.state.error || this.state.expired || !/^\d{4}$/.test(this.state.postalCode.trim())) return;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.state.candidateId && this.state.estimateEnabled) this.debounce=setTimeout(() => { this.debounce=null; void this.quote(); },500);
    else if (this.state.lookup.status === 'idle') this.debounce=setTimeout(() => { this.debounce=null; void this.lookup(); },500);
  }
  activate() { this.active=true; this.expireIfNeeded(); this.schedule(); }
  /** Checkout needs the shared destination, but requests its own server-bound quote. */
  setEstimateEnabled(enabled:boolean) {
    if (this.state.estimateEnabled === enabled) return;
    if (!enabled) { if (this.debounce) clearTimeout(this.debounce); this.debounce=null; this.quoteRequest?.abort(); this.quoteRequest=null; }
    this.update({estimateEnabled:enabled,...(!enabled ? {loading:false} : {})});
    this.schedule();
  }
  syncCart(mode:'api'|'demo', lines:QuoteLine[], unresolved:boolean, totalsKey='') {
    const key=shippingCartKey(mode,lines,unresolved,totalsKey);
    const lineKey=JSON.stringify([mode,lines.map(line => [line.productId,line.variantId,line.quantity])]);
    if (unresolved && lineKey === this.lineKey) { this.unresolved=true; return; }
    if (key === this.cartKey) { this.unresolved=unresolved; this.schedule(); return; }
    const modeChanged=this.state.mode !== mode;
    this.cancel(); this.cartKey=key; this.lineKey=lineKey; this.mode=mode; this.lines=lines.map(line => ({...line})); this.unresolved=unresolved;
    if (modeChanged) this.destinationHint=null;
    const lookup=modeChanged || this.state.lookup.status === 'loading' ? {status:'idle' as const,candidates:[]} : this.state.lookup;
    this.update({mode,cartKey:key,lookup,...(modeChanged ? {candidateId:null} : {}),quote:null,selection:null,loading:false,error:false,expired:false}); this.schedule();
  }
  setPostalCode(postalCode:string) {
    if (postalCode === this.state.postalCode) return;
    if (this.destinationHint?.postalCode !== postalCode.trim()) this.destinationHint=null;
    this.cancel(); this.update({postalCode,lookup:{status:'idle',candidates:[]},candidateId:null,quote:null,selection:null,loading:false,error:false,expired:false}); this.schedule();
  }
  selectDestination(id:string) {
    if (id === (this.state.candidateId ?? '') || (id && !this.state.lookup.candidates.some(item => item.id === id))) return;
    this.destinationHint=id ? {postalCode:this.state.postalCode.trim(),candidateId:id} : null;
    this.cancel(); this.update({candidateId:id || null,quote:null,selection:null,loading:false,error:false,expired:false}); this.schedule();
  }
  restoreDestinationHint(hint: {postalCode:string;candidateId:string} | null) { this.destinationHint=hint; }
  invalidateDestination() {
    this.destinationHint=null;
    this.cancel();
    this.update({lookup:{status:'needs_lookup',candidates:[]},candidateId:null,quote:null,selection:null,loading:false,error:false,expired:false});
  }
  async lookup() {
    if (!this.active || this.lookupRequest || this.mode !== 'api' || this.unresolved || !this.lines.length || !/^\d{4}$/.test(this.state.postalCode.trim())) return;
    this.cancel();
    const controller=new AbortController(), generation=this.generation; this.lookupRequest=controller;
    this.update({lookup:{status:'loading',candidates:[]},candidateId:null,quote:null,selection:null,loading:false,error:false,expired:false});
    if (!this.active || generation !== this.generation || controller.signal.aborted) return;
    try {
      const response=await this.request('/api/v1/shipping/destination',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postalCode:this.state.postalCode.trim()}),signal:controller.signal});
      if (!response.ok) throw new Error('Destination unavailable');
      const result=parseLookup(await response.json());
      if (this.lookupRequest !== controller || controller.signal.aborted) return;
      this.lookupRequest=null;
      const hint = this.destinationHint;
      const restored = result.status === 'ambiguous' && hint?.postalCode === this.state.postalCode.trim() && result.candidates.some(item => item.id === hint.candidateId) ? hint.candidateId : null;
      this.update({lookup:result,candidateId:result.status === 'resolved' ? result.candidates[0].id : restored});
      if (!this.active || generation !== this.generation) return;
      if (result.status === 'resolved' && this.state.estimateEnabled) void this.quote();
      else if (restored) this.schedule();
    } catch {
      if (this.lookupRequest !== controller || controller.signal.aborted) return;
      this.lookupRequest=null; this.update({lookup:{status:'unavailable',candidates:[]},candidateId:null});
    }
  }
  private async quote() {
    if (!this.active || this.mode !== 'api' || this.unresolved || !this.lines.length || !this.state.candidateId || this.state.loading) return;
    const controller=new AbortController(), generation=this.generation; this.quoteRequest=controller;
    const destination={postalCode:this.state.postalCode.trim(),candidateId:this.state.candidateId}, lines=this.lines.map(line => ({...line}));
    this.update({quote:null,selection:null,loading:true,error:false,expired:false});
    if (!this.active || generation !== this.generation || controller.signal.aborted) return;
    try {
      const response=await this.request('/api/v1/shipping/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines,destination}),signal:controller.signal});
      if (!response.ok) throw new Error('Shipping unavailable');
      const result=parseShippingResult(await response.json());
      if (this.quoteRequest !== controller || controller.signal.aborted) return;
      this.quoteRequest=null;
      if (result.status === 'unavailable' && result.reason === 'INVALID_DESTINATION') this.update({lookup:{status:'idle',candidates:[]},candidateId:null,quote:result,loading:false});
      else this.update({quote:result,loading:false});
      if (this.active && generation === this.generation) this.expireIfNeeded();
    } catch {
      if (this.quoteRequest !== controller || controller.signal.aborted) return;
      this.quoteRequest=null; this.update({loading:false,error:true});
    }
  }
  retry() {
    this.cancel();
    const lookup=this.state.candidateId ? this.state.lookup : {status:'idle' as const,candidates:[]};
    this.update({lookup,quote:null,selection:null,loading:false,error:false,expired:false}); this.schedule();
  }
  select(index:number,pointId?:number) {
    this.expireIfNeeded(); const quote=this.state.quote;
    if (!quote || quote.status !== 'quoted') return;
    const option=quote.options[index];
    if (!option || (option.serviceCode === 'pickup_point' && !option.pickupPoints?.some(point => point.id === pointId)) || (option.serviceCode !== 'pickup_point' && pointId !== undefined)) return;
    this.update({selection:{choiceKey:pointId === undefined ? `${index}` : `${index}:${pointId}`,shipping:{amountMinor:option.amountMinor,currency:option.currency,validUntil:quote.validUntil}}});
  }
  expireIfNeeded() {
    if (this.expiry) clearTimeout(this.expiry); this.expiry=null;
    if (!this.active) return;
    const quote=this.state.quote; if (!quote || quote.status !== 'quoted') return;
    const remaining=quote.validUntil-this.now();
    if (remaining <= 0) { this.update({quote:null,selection:null,expired:true}); return; }
    this.expiry=setTimeout(() => this.expireIfNeeded(),remaining);
  }
  dispose() {
    this.active=false; this.generation++;
    this.cancel();
    if (this.state.loading || this.state.lookup.status === 'loading') this.update({loading:false,lookup:this.state.lookup.status === 'loading' ? {status:'idle',candidates:[]} : this.state.lookup});
  }
}
