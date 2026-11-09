import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import type { Socket } from 'node:net';

/** Exercise the real Node/Express request pipeline without opening a network port. */
export async function requestInMemory(handler: (req: IncomingMessage, res: ServerResponse) => void, path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const chunks: Buffer[] = [];
  const socket = new Duplex({ read() {}, write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const req = new IncomingMessage(socket as Socket);
  req.url = path; req.method = options.method ?? 'GET'; req.httpVersion = '1.0'; req.httpVersionMajor = 1; req.httpVersionMinor = 0;
  req.headers = { host: 'shop.example', connection: 'close', ...options.headers };
  const body = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
  if (body) { req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(body.length); }
  const res = new ServerResponse(req); res.assignSocket(socket as Socket);
  return new Promise<{ status: number; headers: Record<string, string>; text: string }>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.destroy(); reject(Error(`Request did not finish: ${path}`)); }, 10000);
    res.on('error', reject); socket.on('error', reject);
    res.on('finish', () => {
      clearTimeout(timeout);
      const raw = Buffer.concat(chunks).toString('utf8'), start = raw.indexOf('\r\n\r\n');
      resolve({ status: res.statusCode, headers: Object.fromEntries(Object.entries(res.getHeaders()).map(([key, value]) => [key, String(value)])), text: raw.slice(start + 4) });
      socket.destroy();
    });
    req.complete = true;
    if (body) req.push(body); req.push(null);
    handler(req, res);
  });
}
