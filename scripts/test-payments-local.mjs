import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.slice(2).some(value => value !== '--local-root')) throw Error('Only --local-root is supported');
let local = {};
try { local = parseEnv(await readFile(resolve(root, '.env'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const env = { ...local, ...process.env, PAYMENTS_LOCAL_INTEGRATION: '1' };
delete env.NODE_TEST_CONTEXT;
if (env.NODE_ENV !== 'development' || env.DB_HOST !== '127.0.0.1') throw Error('Requires NODE_ENV=development and DB_HOST=127.0.0.1');
if (process.argv.includes('--local-root')) { env.DB_USERNAME = 'root'; env.DB_PASSWORD = ''; }
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', 'tests/integration/payment-scenarios.integration.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) stream.on('data', data => { destination.write(data); output += data.toString(); });
const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', code => done(code ?? 1)); });
const folder = resolve(root, 'artifacts/payment-scenarios'); await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, 'latest.json'), JSON.stringify({ date: new Date().toISOString(), success: code === 0, environment: 'Real local MariaDB and HTTP; simulated Mercado Pago responses; no external transactions', output }, null, 2));
process.exitCode = code;
