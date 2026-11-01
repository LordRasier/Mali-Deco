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
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
  } finally { reader.releaseLock(); }
}

/** This factory is not registered in the application; enabling it requires explicit wiring. */
export function createZipnovaTransport(env: ZipnovaEnv, fetcher: typeof fetch = fetch): ZipnovaTransport | undefined {
  if (!env.ZIPNOVA_ENABLED || env.ZIPNOVA_ENABLED === 'false') return undefined;
  if (env.ZIPNOVA_ENABLED !== 'true') throw new Error('Invalid Zipnova enabled configuration');
  const token = credential(env.ZIPNOVA_API_TOKEN, true);
  const secret = credential(env.ZIPNOVA_API_SECRET, false);
  const authorization = `Basic ${Buffer.from(`${token}:${secret}`, 'utf8').toString('base64')}`;
  return async payload => {
    const signal = AbortSignal.timeout(10000);
    try {
      const response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify(payload),
      });
      const body = response.status >= 200 && response.status < 300 ? await readJson(response) : null;
      return { status: response.status, body };
    } catch {
      const error = new Error('Zipnova request failed');
      if (signal.aborted) error.name = 'TimeoutError';
      throw error;
    }
  };
}
