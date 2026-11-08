import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createPaymentGateway, webhookPath } from './payment-gateway.mjs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
const { fetch, AbortSignal } = globalThis;

if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('This local launcher supports Windows x64');
if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_PAYMENT_GATEWAY_ENABLED !== 'true') throw Error('Requires explicit development opt-in');
const folder = resolve('.local-tools');
await mkdir(folder, { recursive: true });
const binary = resolve(folder, 'cloudflared-2026.10.7.exe');
const digest = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343';
let bytes;
try { bytes = await readFile(binary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!bytes) {
  const response = await fetch('https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-windows-amd64.exe', { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error('Unable to download official cloudflared release');
  bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== 55390512 || createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('Cloudflared integrity check failed');
  await writeFile(binary, bytes, { flag: 'wx' });
}
if (createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('Cloudflared integrity check failed');
const port = Number(process.env.PAYMENT_GATEWAY_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535 || port === Number(process.env.PORT || 3000)) throw Error('Gateway must use its own valid port');
const gateway = createPaymentGateway({ targetPort: Number(process.env.PORT || 3000) });
gateway.listen(port, '127.0.0.1'); await once(gateway, 'listening');
const tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let announced = false;
const observe = async bytes => {
  const text = bytes.toString(); process.stdout.write(text);
  // Only the success banner contains a public hostname. Error messages may
  // mention api.trycloudflare.com, which must never become the callback URL.
  const url = text.match(/\|\s+(https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com)\s+\|/)?.[1];
  if (!url || announced) return;
  announced = true;
  const runtime = { pid: process.pid, childPid: tunnel.pid, gatewayPort: port, url, returnUrl: url + '/payments/return', webhookUrl: url + webhookPath };
  await writeFile(resolve(folder, 'payment-tunnel.json'), JSON.stringify(runtime, null, 2));
  console.log('\nMERCADOPAGO_TEST_RETURN_URL=' + runtime.returnUrl + '\nMERCADOPAGO_WEBHOOK_URL=' + runtime.webhookUrl);
};
for (const stream of [tunnel.stdout, tunnel.stderr]) stream.on('data', bytes => { void observe(bytes).catch(() => { tunnel.kill(); gateway.close(); process.exitCode = 1; }); });
tunnel.once('error', () => { gateway.close(); process.exitCode = 1; });
tunnel.once('exit', code => { gateway.close(); process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { tunnel.kill(); gateway.close(); });
