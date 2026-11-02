// Explicit local integration check; no database, credentials or provider calls.
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');
const webDir = path.join(root, 'apps', 'web');
function reserve() { return new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); }); }
function close(server) { return new Promise(resolve => server.close(resolve)); }
function stop(child) { if (child?.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio:'ignore' }); }
const delay = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
async function waitFor(url) { for (let i=0; i<150; i++) { try { await globalThis.fetch(url, {signal:globalThis.AbortSignal.timeout(1000)}); return; } catch { await delay(300); } } throw new Error('Local test server did not start'); }

async function main() {
  const apiReservation = await reserve(), webReservation = await reserve();
  const apiPort = apiReservation.address().port, webPort = webReservation.address().port;
  await Promise.all([close(apiReservation), close(webReservation)]);
  const apiOrigin = `http://127.0.0.1:${apiPort}`, webOrigin = `http://127.0.0.1:${webPort}`;
  const env = {...globalThis.process.env};
  for (const key of Object.keys(env)) if (key.startsWith('ZIPNOVA_') || key === 'DB_HOST' || key === 'NODE_OPTIONS' || key === 'API_BASE_URL') delete env[key];
  Object.assign(env, {NODE_ENV:'development', STOREFRONT_MODE:'demo', NEXT_TELEMETRY_DISABLED:'1', ZIPNOVA_ENABLED:'false', ZIPNOVA_OPERATOR_ORIGIN:webOrigin});
  let api, web;
  try {
    api = spawn(globalThis.process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/main.ts'], {cwd:apiDir, env:{...env,PORT:String(apiPort)}, stdio:'ignore'});
    web = spawn(globalThis.process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)], {cwd:webDir, env:{...env,DEV_API_PROXY_ORIGIN:apiOrigin}, stdio:'ignore'});
    await Promise.all([waitFor(apiOrigin + '/'), waitFor(webOrigin + '/')]);
    function post(base, route, extra = {}) { return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify(route === 'quote' ? {lines:[{productId:'p1',variantId:'v1',quantity:1}],destination:{postalCode:'7600',candidateId:'A'.repeat(24)}} : {postalCode:'7600'});
      const headers = {origin:webOrigin,'content-type':'application/json','sec-fetch-site':'same-origin',...extra};
      if (headers.origin === null) delete headers.origin;
      const request = http.request(base + '/api/v1/shipping/' + route, {method:'POST',headers,timeout:45000}, response => {
        let data=''; response.on('data', chunk => { data += chunk; }); response.on('end', () => { try { resolve({status:response.statusCode,body:response.statusCode === 200 ? JSON.parse(data) : null}); } catch (error) { reject(error); } });
      });
      request.on('timeout', () => request.destroy(new Error('Local request timed out'))); request.on('error', reject); request.end(requestBody);
    }); }
    for (const target of [apiOrigin, webOrigin]) {
      for (const route of ['quote','destination']) {
        const good = await post(target,route); assert.equal(good.status, 200); assert.equal(good.body.status, 'unavailable');
        const label = `${target === apiOrigin ? 'API' : 'proxy'} ${route}`;
        assert.equal((await post(target,route,{origin:'http://attacker.example'})).status, 403, `${label}: origin`);
        assert.equal((await post(target,route,{origin:null})).status, 403, `${label}: missing origin`);
        assert.equal((await post(target,route,{origin:'null'})).status, 403, `${label}: null origin`);
        assert.equal((await post(target,route,{host:`attacker.example:${target === apiOrigin ? apiPort : webPort}`})).status, 403, `${label}: host`);
        assert.equal((await post(target,route,{'sec-fetch-site':'cross-site'})).status, 403, `${label}: fetch-site`);
        assert.equal((await post(target,route,{'content-type':'text/plain'})).status, 403, `${label}: content-type`);
      }
    }
    globalThis.console.log('Direct API and Next proxy: valid local request allowed; invalid origin, Host, fetch-site and content type rejected.');
  } finally { stop(web); stop(api); }
}
main().catch(error => { globalThis.console.error('Local proxy integration check failed:', error.message); globalThis.process.exitCode=1; });
