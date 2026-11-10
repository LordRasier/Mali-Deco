// Explicit single-server local smoke; no database, credentials or provider calls.
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function localShippingEnvironment(port, inherited = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local test port');
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH']) if (inherited[key] !== undefined) env[key] = inherited[key];
  return { ...env, NODE_ENV: 'development', ZIPNOVA_ENABLED: 'false', ZIPNOVA_OPERATOR_ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port) };
}
export function localShippingRequest(origin, route, extra = {}, method = 'POST') { return new Promise((resolve, reject) => {
  const body = JSON.stringify(route === 'quote' ? { lines: [{ productId: 'p1', variantId: 'v1', quantity: 1 }], destination: { postalCode: '7600', candidateId: 'A'.repeat(24) } } : { postalCode: '7600' });
  const headers = { origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...extra };
  if (headers.origin === null) delete headers.origin;
  const request = http.request(origin + '/api/v1/shipping/' + route, { method, headers, timeout: 10000 }, response => {
    let data = ''; response.on('data', chunk => { data += chunk; }); response.on('end', () => {
      try { resolve({ status: response.statusCode, body: response.statusCode === 200 ? JSON.parse(data) : null }); } catch (error) { reject(error); }
    });
  });
  request.on('timeout', () => request.destroy(new Error('Local request timed out')));
  request.on('error', error => reject(new Error(`${method} shipping/${route} ${JSON.stringify(extra)}: ${error.message}`)));
  // An unframed GET body is parsed as another request and can reset a reused socket.
  request.end(method === 'GET' ? undefined : body);
}); }
function reserve() { return new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); }); }
function close(server) { return new Promise(resolve => server.close(resolve)); }
function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (globalThis.process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}
const delay = milliseconds => new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
async function waitFor(origin, child) {
  for (let count = 0; count < 150; count++) {
    if (child.exitCode !== null) throw new Error('Local Nest server exited before readiness');
    try { const response = await globalThis.fetch(origin + '/api/v1/health', { signal: globalThis.AbortSignal.timeout(1000), redirect: 'error' }); if (response.status === 200) return; }
    catch { /* The owned server may still be starting. */ }
    await delay(300);
  }
  throw new Error('Local Nest server did not start');
}
async function main() {
  const reservation = await reserve(), port = reservation.address().port; await close(reservation);
  const origin = `http://127.0.0.1:${port}`; let server;
  try {
    server = spawn(globalThis.process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/main.ts'], {
      cwd: root, env: localShippingEnvironment(port, globalThis.process.env), stdio: 'ignore', windowsHide: true,
    });
    await waitFor(origin, server);
    assert.equal((await globalThis.fetch(origin + '/carrito', { redirect: 'error' })).status, 200, 'one server must serve canonical HTML');
    assert.equal((await globalThis.fetch(origin + '/checkout', { redirect: 'error' })).status, 404, 'checkout remains opt-in');
    const post = (route, extra = {}, method = 'POST') => localShippingRequest(origin, route, extra, method);
    for (const route of ['quote', 'destination']) {
      const good = await post(route); assert.equal(good.status, 200); assert.equal(good.body.status, 'unavailable');
      for (const [label, headers] of [
        ['foreign origin', { origin: 'http://attacker.example' }], ['missing origin', { origin: null }], ['null origin', { origin: 'null' }],
        ['foreign Host', { host: `attacker.example:${port}` }], ['alias Host', { host: `localhost:${port}` }],
        ['different-port Host', { host: `127.0.0.1:${port === 65535 ? port - 1 : port + 1}` }],
        ['cross-site', { 'sec-fetch-site': 'cross-site' }], ['non-JSON', { 'content-type': 'text/plain' }],
      ]) assert.equal((await post(route, headers)).status, 403, `${route}: ${label}`);
      assert.equal((await post(route, {}, 'GET')).status, 404, `${route}: no GET mutation alias`);
    }
    globalThis.console.log('One Nest server: canonical HTML and API ready; shipping disabled; origin/Host/fetch-site/content-type negatives rejected. No database or provider enabled.');
  } finally { stop(server); }
}
if (globalThis.process.argv[1] && path.resolve(globalThis.process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { globalThis.console.error('Local shipping smoke failed:', error.message); globalThis.process.exitCode = 1; });
}
