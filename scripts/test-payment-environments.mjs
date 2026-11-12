import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.slice(2).some(arg => arg !== '--local-root')) throw Error('Only --local-root is supported');
const local = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
const env = { ...local, ...process.env, PAYMENTS_LOCAL_INTEGRATION: '1', ORDER_EMAIL_MODE: 'disabled' };
if (env.NODE_ENV !== 'development' || env.DB_HOST !== '127.0.0.1') throw Error('Requires local development MariaDB');
if (process.argv.includes('--local-root')) { env.DB_USERNAME = 'root'; env.DB_PASSWORD = ''; }
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', 'tests/integration/payment-environments.integration.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data.toString(); });
const code = await new Promise((done, reject) => { child.on('error', reject); child.on('exit', code => done(code ?? 1)); });
await mkdir(resolve(root, '.local-tools'), { recursive: true });
await writeFile(resolve(root, '.local-tools/payment-environments-integration.log'), output);
process.stdout.write(output); process.exitCode = code;
