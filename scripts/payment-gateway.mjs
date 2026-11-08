import { createServer } from 'node:http';
import { pathToFileURL, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
const { fetch, AbortSignal } = globalThis;

export const webhookPath = '/api/v1/payments/mercadopago/webhook';
const returnPage = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Volver a Mali Deco</title><main><h1>Volvé a la pestaña de Mali Deco</h1><p>Podés cerrar esta pestaña y consultar el pago en el checkout local. Esta página no confirma el resultado del pago.</p></main></html>';

/** A tunnel may reach only this ingress, never the admin or checkout APIs. */
export function createPaymentGateway({ targetPort = 3000, request = fetch } = {}) {
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw Error('Invalid application port');
  let inflight = 0;
  const server = createServer(async (req, res) => {
    const finish = (status, body = '') => { if (!res.destroyed) { res.writeHead(status); res.end(body); } };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (!req.url || req.url.length > 2048 || !req.url.startsWith('/') || req.url.startsWith('//')) return finish(400);
    const url = new URL(req.url, 'http://gateway.invalid');
    if (req.method === 'GET' && url.pathname === '/payments/return') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return finish(200, returnPage); // Ignore and never log payment return parameters.
    }
    if (req.method !== 'POST' || url.pathname !== webhookPath) return finish(404);
    if (inflight >= 8) { res.setHeader('Retry-After', '5'); return finish(503); }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return finish(415);
    if (Number(req.headers['content-length'] ?? 0) > 16384) return finish(413);
    const dataIds = url.searchParams.getAll('data.id');
    if (dataIds.length !== 1 || !/^[1-9]\d{0,15}$/.test(dataIds[0])) return finish(400);
    if (!req.headers['x-signature'] || !req.headers['x-request-id']) return finish(401);
    inflight++;
    try {
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16384) { finish(413); req.destroy(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      try { JSON.parse(body); } catch { return finish(400); }
      // Neither incoming cookies nor forwarding headers cross into the local app.
      const response = await request(`http://127.0.0.1:${targetPort}${webhookPath}?data.id=${dataIds[0]}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(35000), body,
        headers: { 'Content-Type': 'application/json', 'X-Signature': String(req.headers['x-signature']), 'X-Request-Id': String(req.headers['x-request-id']) },
      });
      await response.body?.cancel();
      finish(response.status === 200 ? 200 : [400, 401, 403, 429].includes(response.status) ? response.status : 503);
    } catch { finish(503); }
    finally { inflight--; }
  });
  server.requestTimeout = 40000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_PAYMENT_GATEWAY_ENABLED !== 'true') throw Error('Local payment gateway requires explicit development opt-in');
  const port = Number(process.env.PAYMENT_GATEWAY_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid gateway port');
  const server = createPaymentGateway({ targetPort: Number(process.env.PORT || 3000) });
  server.listen(port, '127.0.0.1', () => console.log(`Payment ingress: http://127.0.0.1:${port}. Only webhook and /payments/return are available.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
