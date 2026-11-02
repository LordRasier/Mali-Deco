export type PostalCandidate = { id:string; label:string };
export type PostalLookup = { status:'resolved' | 'ambiguous' | 'invalid' | 'not_found' | 'too_many' | 'unavailable'; candidates:PostalCandidate[] };

function candidate(value:unknown): PostalCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string,unknown>;
  return typeof item.id === 'string' && /^[A-Za-z0-9_-]{24}$/.test(item.id) && typeof item.label === 'string' && !!item.label.trim() && item.label.length <= 305 && ![...item.label].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? {id:item.id,label:item.label} : null;
}
export function parseLookup(value:unknown): PostalLookup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid destination');
  const data = value as Record<string,unknown>;
  if (data.status === 'resolved') { const item = candidate(data.candidate); if (!item) throw new Error('Invalid destination'); return {status:'resolved',candidates:[item]}; }
  if (data.status === 'ambiguous') {
    if (!Array.isArray(data.candidates) || data.candidates.length < 2 || data.candidates.length > 1000) throw new Error('Invalid destination');
    const candidates = data.candidates.map(candidate);
    if (candidates.some(item => !item) || new Set(candidates.map(item => item!.id)).size !== candidates.length) throw new Error('Invalid destination');
    return {status:'ambiguous',candidates:candidates as PostalCandidate[]};
  }
  if (data.status === 'invalid' || data.status === 'not_found' || data.status === 'too_many' || data.status === 'unavailable') return {status:data.status,candidates:[]};
  throw new Error('Invalid destination');
}
