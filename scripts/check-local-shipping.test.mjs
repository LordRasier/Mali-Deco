import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { localShippingEnvironment, localShippingRequest } from './check-local-shipping.mjs';

test('one-server smoke environment is explicitly allowlisted and cannot inherit DB/provider/proxy configuration', () => {
  const env = localShippingEnvironment(3191, { SystemRoot: 'C:/Windows', PATH: 'synthetic-path', DB_HOST: 'remote.invalid', DB_PASSWORD: 'private', ZIPNOVA_API_TOKEN: 'private', ZIPNOVA_ENABLED: 'true', API_BASE_URL: 'https://remote.invalid', DEV_API_PROXY_ORIGIN: 'https://remote.invalid', NODE_OPTIONS: '--inspect', STOREFRONT_MODE: 'api' });
  assert.deepEqual(env, { SystemRoot: 'C:/Windows', PATH: 'synthetic-path', NODE_ENV: 'development', ZIPNOVA_ENABLED: 'false', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3191', PORT: '3191' });
  for (const port of [0, -1, 65536, 1.5]) assert.throws(() => localShippingEnvironment(port, {}));
});

test('the smoke GET-alias probe sends no JSON body and does not poison the next HTTP request', async () => {
  const parserErrors = [], requests = [];
  const server = http.createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk; }); request.on('end', () => {
      requests.push({ method: request.method, body }); response.writeHead(request.method === 'GET' ? 404 : 200, { 'Content-Type': 'application/json' }); response.end('{"status":"unavailable"}');
    });
  });
  server.on('clientError', (error, socket) => { parserErrors.push(error.code); socket.destroy(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await localShippingRequest(origin, 'quote', {}, 'GET')).status, 404);
    assert.equal((await localShippingRequest(origin, 'destination')).status, 200);
    assert.equal(requests[0].body, ''); assert.match(requests[1].body, /postalCode/); assert.deepEqual(parserErrors, []);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
