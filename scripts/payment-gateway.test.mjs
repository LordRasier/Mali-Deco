import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createPaymentGateway, webhookPath } from './payment-gateway.mjs';
const { fetch, Response } = globalThis;

test('payment ingress exposes only the return and signed webhook routes, strips private headers and bounds requests', async () => {
  const requests = [];
  const server = createPaymentGateway({ request: async (url, options) => { requests.push({url,options}); return new Response(null,{status:200}); } });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = (path, extra = {}) => fetch(origin+path, {method:'POST',headers:{'Content-Type':'application/json','X-Signature':'signed','X-Request-Id':'fixture',Cookie:'private-admin-session','X-Forwarded-For':'public-client'},body:'{}',...extra});
  try {
    for (const path of ['/admin','/api/v1/auth/me','/api/v1/checkout/orders','/payments/return']) assert.equal((await send(path)).status,404);
    const returned = await fetch(origin+'/payments/return?status=approved&external_reference=private-marker');
    assert.equal(returned.status,200); assert.doesNotMatch(await returned.text(),/private-marker|approved/);
    assert.equal((await send(webhookPath+'?data.id=123')).status,200);
    assert.equal(requests.length,1); assert.equal(requests[0].options.headers.Cookie,undefined); assert.equal(requests[0].options.headers['X-Forwarded-For'],undefined);
    assert.equal((await send(webhookPath+'?data.id=123&data.id=456')).status,400);
    assert.equal((await send(webhookPath+'?data.id=123',{headers:{'Content-Type':'application/json'}})).status,401);
    assert.equal((await send(webhookPath+'?data.id=123',{body:'x'.repeat(17000)})).status,413);
    assert.equal((await send(webhookPath+'?data.id=123',{body:'invalid json'})).status,400);
    assert.equal(requests.length,1);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
