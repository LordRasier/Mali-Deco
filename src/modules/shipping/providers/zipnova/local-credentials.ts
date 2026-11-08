import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Development-only opt-in: private files supply credentials, never operational flags. */
export function loadLocalZipnovaCredentials(env: NodeJS.ProcessEnv): void {
  if (env.npm_lifecycle_event !== 'dev' || env.NODE_ENV !== 'development' || env.ZIPNOVA_ENABLED !== 'true' || !env.ZIPNOVA_ENV_FILE) return;
  let values: ReturnType<typeof parseEnv>;
  try { values = parseEnv(readFileSync(env.ZIPNOVA_ENV_FILE, 'utf8')); }
  catch { throw new Error('Unable to load local Zipnova credentials'); }
  for (const key of ['ZIPNOVA_API_TOKEN', 'ZIPNOVA_API_SECRET']) {
    if (env[key] === undefined && values[key] !== undefined) env[key] = values[key];
  }
}
