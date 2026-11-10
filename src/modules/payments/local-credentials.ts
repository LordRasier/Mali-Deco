import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Only npm run dev may load the explicitly selected private credential file. */
export function loadLocalPaymentCredentials(env: NodeJS.ProcessEnv): void {
  if (env.npm_lifecycle_event !== 'dev' || env.NODE_ENV !== 'development' || env.MERCADOPAGO_TEST_ENABLED !== 'true' || !env.MERCADOPAGO_ENV_FILE) return;
  let values: ReturnType<typeof parseEnv>;
  try { values = parseEnv(readFileSync(env.MERCADOPAGO_ENV_FILE, 'utf8')); }
  catch { throw new Error('Unable to load local Mercado Pago credentials'); }
  for (const key of ['MERCADOPAGO_TEST_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET']) {
    if (env[key] === undefined && values[key] !== undefined) env[key] = values[key];
  }
}
