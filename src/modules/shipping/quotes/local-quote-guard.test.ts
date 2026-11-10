import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLocalQuoteRequest } from './local-quote-guard';

const env = { NODE_ENV: 'development', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000', PORT: '3000' };
const request = { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, socket: { remoteAddress: '127.0.0.1' } };

test('only accepts local development JSON POSTs from the configured literal loopback origin', () => {
  assert.equal(isLocalQuoteRequest(request, env), true);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, host: '127.0.0.1:3000' } }, env), true);
  assert.equal(isLocalQuoteRequest(request, { ...env, NODE_ENV: 'production' }), false);
  assert.equal(isLocalQuoteRequest(request, { ...env, ZIPNOVA_OPERATOR_ORIGIN: 'http://localhost:3000' }), false);
  assert.equal(isLocalQuoteRequest({ ...request, socket: { remoteAddress: '10.0.0.2' } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, method: 'GET' }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, host: 'attacker.example:3001' } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, origin: 'http://attacker.example' } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, origin: 'null' } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, origin: '' } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, 'sec-fetch-site': 'cross-site' } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, 'content-type': 'text/plain' } }, env), false);
});

test('single Nest origin and Host must match PORT exactly; old two-port proxy aliases are rejected', () => {
  assert.equal(isLocalQuoteRequest(request, { ...env, PORT: undefined }), true);
  assert.equal(isLocalQuoteRequest(request, { ...env, PORT: '3001' }), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, host: '127.0.0.1:3001' } }, { ...env, PORT: '3001' }), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, origin: undefined } }, env), false);
  assert.equal(isLocalQuoteRequest({ ...request, headers: { ...request.headers, host: 'localhost:3000' } }, env), false);
  for (const port of ['0', '03000', '65536', 'bad']) assert.equal(isLocalQuoteRequest(request, { ...env, PORT: port }), false);
});
