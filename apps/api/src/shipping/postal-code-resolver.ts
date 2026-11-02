import { randomBytes } from 'node:crypto';
import type { Destination } from './zipnova';

type Candidate = { id: string; label: string; city: string; state: string };
type Entry = { expiresAt: number; candidates: Candidate[] };
type PublicCandidate = { id: string; label: string };
export type PostalResult = { status:'resolved'; candidate:PublicCandidate } | { status:'ambiguous'; candidates:PublicCandidate[] } | { status:'invalid' | 'not_found' | 'too_many' | 'unavailable' };

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 150 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  return value.trim();
}
async function readArray(response: Response): Promise<unknown[] | null> {
  if (!response.body) return null;
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); return null; } chunks.push(part.value); }
    try { const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); return Array.isArray(data) ? data : null; } catch { return null; }
  } finally { reader.releaseLock(); }
}

/** Public Andreani master-data lookup; candidate tokens are scoped to the cached CP. */
export class PostalCodeResolver {
  private cache = new Map<string, Entry>();
  private inFlight = new Map<string, Promise<PostalResult>>();
  private active = 0;
  private sentAt: number[] = [];
  private cooldownUntil = 0;
  constructor(private readonly request: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  async lookup(code: string): Promise<PostalResult> {
    if (!/^\d{4}$/.test(code)) return {status:'invalid'};
    const cached = this.get(code);
    if (cached) return this.publicResult(cached);
    const pending = this.inFlight.get(code);
    if (pending) return pending;
    const operation = this.load(code);
    this.inFlight.set(code,operation);
    try { return await operation; } finally { this.inFlight.delete(code); }
  }
  resolve(code: string, id: string): Destination | null {
    if (!/^\d{4}$/.test(code) || !/^[A-Za-z0-9_-]{24}$/.test(id)) return null;
    const candidate = this.get(code)?.candidates.find(item => item.id === id);
    return candidate ? {country:'AR',postalCode:code,city:candidate.city,state:candidate.state} : null;
  }
  private get(code: string): Entry | null {
    const entry = this.cache.get(code);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) { this.cache.delete(code); return null; }
    this.cache.delete(code); this.cache.set(code,entry);
    return entry;
  }
  private publicResult(entry: Entry): PostalResult {
    const candidates = entry.candidates.map(({id,label}) => ({id,label}));
    if (!candidates.length) return {status:'not_found'};
    return candidates.length === 1 ? {status:'resolved',candidate:candidates[0]} : {status:'ambiguous',candidates};
  }
  private async load(code: string): Promise<PostalResult> {
    const found = new Map<string, {city:string;state:string}>();
    try {
      for (let page=1; page<=3; page++) {
        const current = this.now();
        this.sentAt = this.sentAt.filter(time => current - time < 60000);
        if (this.active >= 2 || this.sentAt.length >= 30 || current < this.cooldownUntil) return {status:'unavailable'};
        this.active++; this.sentAt.push(current);
        let rows: unknown[] | null;
        try {
          const response = await this.request(`https://apis.andreani.com/v1/localidades?codigosPostales=${code}&p=${page}`, {method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
          if (!response.ok) {
            if (response.status === 429) {
              const retry = response.headers.get('retry-after')?.trim() ?? '', date = Date.parse(retry), now = this.now();
              const delay = /^\d+$/.test(retry) ? Math.min(Number.MAX_SAFE_INTEGER,Number(retry)*1000) : Number.isFinite(date) ? Math.max(0,date-now) : 60000;
              this.cooldownUntil = Math.max(this.cooldownUntil,Math.min(Number.MAX_SAFE_INTEGER,now+delay));
            }
            if (response.body) await response.body.cancel();
            return {status:'unavailable'};
          }
          rows = await readArray(response);
        } finally { this.active--; }
        if (!rows || rows.length > 2000) return {status:'unavailable'};
        for (const raw of rows) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {status:'unavailable'};
          const row = raw as Record<string, unknown>, city = cleanText(row.localidad), state = cleanText(row.provincia);
          if (!city || !state || !Array.isArray(row.codigosPostales) || !row.codigosPostales.includes(code)) return {status:'unavailable'};
          found.set(JSON.stringify([city.toLocaleUpperCase('es-AR'),state.toLocaleUpperCase('es-AR')]),{city,state});
          if (found.size > 1000) return {status:'too_many'};
        }
        if (rows.length < 2000) {
          const candidates = [...found.values()].sort((a,b) => `${a.city} ${a.state}`.localeCompare(`${b.city} ${b.state}`,'es')).map(({city,state}) => ({id:randomBytes(18).toString('base64url'),label:`${city} · ${state}`,city,state}));
          const entry = {expiresAt:this.now() + (candidates.length ? 86400000 : 120000),candidates};
          this.cache.set(code,entry);
          if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
          return this.publicResult(entry);
        }
      }
      return {status:'too_many'};
    } catch { return {status:'unavailable'}; }
  }
}
