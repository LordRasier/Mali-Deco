import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, apiRequest } from '../../src/presentation/admin/client/api.ts';

const settingsPath = '/admin/settings/payments';
const verificationPath = `${settingsPath}/verify`;
const failure = { code: 'PAYMENT_VERIFICATION_FAILED', reason: 'seller_id_mismatch', mode: 'production',
  writeOccurred: false, expectedSellerId: '123', actualSellerId: '456', message: 'private-upstream-message' };

test('known pre-write payment failures explain the seller mismatch on save and verification', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(failure, { status: 503 }); };
  try {
    for (const [path, method] of [[settingsPath, 'PUT'], [verificationPath, 'POST']]) {
      await assert.rejects(apiRequest(path, { method }), error => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 503); assert.equal(error.code, 'PAYMENT_VERIFICATION_FAILED');
        assert.match(error.message, /Producción:/);
        assert.match(error.message, /Configurado: 123\. Cuenta autenticada: 456\./);
        assert.match(error.message, /No se modificó la configuración de pagos\./);
        assert.doesNotMatch(error.message, /haberse completado|private-upstream-message/);
        return true;
      });
    }
    assert.equal(calls, 2);
  } finally { globalThis.fetch = oldFetch; }
});

test('payment diagnostics display only fixed descriptions, valid IDs and known variable names', async () => {
  const oldFetch = globalThis.fetch;
  const secret = 'private-upstream-message';
  try {
    for (const body of [
      { ...failure, reason: 'configuration_incomplete', missing: ['MERCADOPAGO_ACCESS_TOKEN', secret] },
      { ...failure, expectedSellerId: secret, actualSellerId: secret },
      { ...failure, reason: 'provider_http_401' },
      { ...failure, reason: 'provider_http_503' },
    ]) {
      globalThis.fetch = async () => Response.json(body, { status: 503 });
      await assert.rejects(apiRequest(settingsPath, { method: 'PUT' }), error => {
        assert.equal(error.code, 'PAYMENT_VERIFICATION_FAILED');
        assert.doesNotMatch(error.message, /private-upstream-message|haberse completado/);
        if (body.reason === 'configuration_incomplete') assert.match(error.message, /MERCADOPAGO_ACCESS_TOKEN/);
        if (body.reason === 'provider_http_401') assert.match(error.message, /HTTP 401/);
        return true;
      });
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('unrecognized or incomplete failure markers preserve uncertainty for writes', async () => {
  const oldFetch = globalThis.fetch;
  try {
    for (const body of [
      { ...failure, code: 'UNKNOWN' }, { ...failure, writeOccurred: true }, { ...failure, writeOccurred: undefined },
      { ...failure, reason: 'private-upstream-message' }, { ...failure, mode: 'unknown' },
    ]) {
      globalThis.fetch = async () => Response.json(body, { status: 503 });
      await assert.rejects(apiRequest(settingsPath, { method: 'PUT' }), error => {
        assert.match(error.message, /haberse completado/);
        assert.doesNotMatch(error.message, /No se modificó|private-upstream-message/);
        return true;
      });
    }
    globalThis.fetch = async () => Response.json(failure, { status: 503 });
    await assert.rejects(apiRequest('/admin/settings', { method: 'PUT' }), error => /haberse completado/.test(error.message));
  } finally { globalThis.fetch = oldFetch; }
});

test('read-only verification never suggests a mutation, even when the response is lost or malformed', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  try {
    for (const remote of [
      async () => new Response('not-json', { status: 503 }),
      async () => { throw Error('offline'); },
      async () => new Response(''),
      async () => new Response('not-json'),
    ]) {
      globalThis.fetch = async (...args) => { calls++; return remote(...args); };
      await assert.rejects(apiRequest(verificationPath, { method: 'POST' }), error => {
        assert.ok(error instanceof ApiError);
        assert.doesNotMatch(error.message, /haberse completado|No se modificó/);
        return true;
      });
      await assert.rejects(apiRequest(settingsPath, { method: 'PUT' }), error => /haberse completado/.test(error.message));
    }
    assert.equal(calls, 8);
  } finally { globalThis.fetch = oldFetch; }
});
