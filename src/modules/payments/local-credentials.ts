import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const credentialKeys = ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'MERCADOPAGO_TEST_ACCESS_TOKEN', 'MERCADOPAGO_TEST_WEBHOOK_SECRET'] as const;
export type PaymentCredentialSource = { key: typeof credentialKeys[number]; source: 'environment' | 'private_file' | 'missing'; privateFileConflict: boolean };

/** An explicit private file supplies secrets only, in either deployment environment. */
export function loadLocalPaymentCredentials(env: NodeJS.ProcessEnv): PaymentCredentialSource[] {
  let values: ReturnType<typeof parseEnv> = {};
  if (env.MERCADOPAGO_ENV_FILE) {
    try { values = parseEnv(readFileSync(env.MERCADOPAGO_ENV_FILE, 'utf8')); }
    catch { throw new Error('Unable to load local Mercado Pago credentials'); }
  }
  return credentialKeys.map(key => {
    const existing = env[key] !== undefined;
    const privateFileConflict = existing && values[key] !== undefined && env[key] !== values[key];
    if (!existing && values[key] !== undefined) env[key] = values[key];
    return { key, source: existing ? 'environment' : values[key] !== undefined ? 'private_file' : 'missing', privateFileConflict };
  });
}
