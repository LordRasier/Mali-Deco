import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** An explicit private file supplies secrets only, in either deployment environment. */
export function loadLocalPaymentCredentials(env: NodeJS.ProcessEnv): void {
  if (!env.MERCADOPAGO_ENV_FILE) return;
  let values: ReturnType<typeof parseEnv>;
  try { values = parseEnv(readFileSync(env.MERCADOPAGO_ENV_FILE, 'utf8')); }
  catch { throw new Error('Unable to load local Mercado Pago credentials'); }
  for (const key of ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'MERCADOPAGO_TEST_ACCESS_TOKEN', 'MERCADOPAGO_TEST_WEBHOOK_SECRET']) {
    if (env[key] === undefined && values[key] !== undefined) env[key] = values[key];
  }
}
