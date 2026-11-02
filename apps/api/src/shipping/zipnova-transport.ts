import type { ZipnovaTransport } from './zipnova-provider';

type ZipnovaEnv = { ZIPNOVA_ENABLED?: string; ZIPNOVA_API_TOKEN?: string; ZIPNOVA_API_SECRET?: string };
const endpoint = 'https://api.zipnova.com.ar/v2/shipments/quote';
const maxResponseBytes = 1024 * 1024;

function credential(value: string | undefined, isToken: boolean): string {
  if (!value || value.length > 512 || !/^[\x21-\x7e]+$/.test(value) || (isToken && value.includes(':'))) throw new Error('Invalid Zipnova credential configuration');
  return value;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxResponseBytes) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'), function (key, value: unknown, ...contexts: [{ source?: string }?]) {
        if (key !== 'price_incl_tax') return value;
        // Node 24 exposes the original primitive token, before IEEE-754 rounding.
        const context = contexts[0];
        return typeof value === 'number' && typeof context?.source === 'string' ? context.source : null;
      });
    } catch { return null; }
  } finally { reader.releaseLock(); }
}

/** The fixed quote-only endpoint is used only when explicitly enabled by the service. */
export function createZipnovaTransport(env: ZipnovaEnv, fetcher: typeof fetch = fetch, now: () => number = Date.now): ZipnovaTransport | undefined {
  if (!env.ZIPNOVA_ENABLED || env.ZIPNOVA_ENABLED === 'false') return undefined;
  if (env.ZIPNOVA_ENABLED !== 'true') throw new Error('Invalid Zipnova enabled configuration');
  const token = credential(env.ZIPNOVA_API_TOKEN, true);
  const secret = credential(env.ZIPNOVA_API_SECRET, false);
  const authorization = `Basic ${Buffer.from(`${token}:${secret}`, 'utf8').toString('base64')}`;
  let active = 0;
  let cooldownUntil = 0;
  let sentAt: number[] = [];
  return async payload => {
    const current = now();
    sentAt = sentAt.filter(time => current - time < 60000);
    if (active >= 2 || sentAt.length >= 10 || current < cooldownUntil) return { status: 429, body: null };
    active++;
    sentAt.push(current);
    const signal = AbortSignal.timeout(10000);
    try {
      const response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify(payload),
      });
      if (response.status === 429) {
        const retry = response.headers.get('retry-after')?.trim() ?? '';
        const currentTime = now();
        const date = Date.parse(retry);
        const delay = /^\d+$/.test(retry) ? Math.min(Number.MAX_SAFE_INTEGER, Number(retry) * 1000) : Number.isFinite(date) ? Math.max(0, date - currentTime) : 60000;
        cooldownUntil = Math.max(cooldownUntil, Math.min(Number.MAX_SAFE_INTEGER, currentTime + delay));
      }
      let body: unknown = null;
      if (response.status >= 200 && response.status < 300) body = await readJson(response);
      else if (response.body) await response.body.cancel();
      return { status: response.status, body };
    } catch {
      const error = new Error('Zipnova request failed');
      if (signal.aborted) error.name = 'TimeoutError';
      throw error;
    } finally { active--; }
  };
}
