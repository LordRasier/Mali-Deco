import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Explicit provider configuration in any deployment; existing process values win. */
export function loadZipnovaEnvironment(env: NodeJS.ProcessEnv): void {
  if (!env.ZIPNOVA_ENV_FILE) return;
  let values: ReturnType<typeof parseEnv>;
  try { values = parseEnv(readFileSync(env.ZIPNOVA_ENV_FILE, 'utf8')); }
  catch { throw new Error('Unable to load Zipnova configuration file'); }
  // Never import database, payment, public origin, or runtime settings from this file.
  for (const key of ['ZIPNOVA_ENABLED', 'ZIPNOVA_CURRENCY', 'ZIPNOVA_CURRENCY_EXPONENT',
    'ZIPNOVA_API_TOKEN', 'ZIPNOVA_API_SECRET', 'ZIPNOVA_ACCOUNT_ID', 'ZIPNOVA_ORIGIN_ID', 'ZIPNOVA_OPERATOR_ORIGIN']) {
    if (env[key] === undefined && values[key] !== undefined) env[key] = values[key];
  }
}
