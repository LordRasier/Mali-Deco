/** Isolated visual fixture. No database, environment files, external requests or real quotes. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createViewEngine } from '../../src/presentation/view-engine';
import { canonicalRoutes } from '../../src/presentation/routing/storefront-routes';

const root = resolve(__dirname, '../..'), views = resolve(root, 'src/presentation');
const read = (path: string) => readFileSync(resolve(views, path), 'utf8');
const engine = createViewEngine({site_header: read('shell/views/header.hbs'), site_footer: read('shell/views/footer.hbs'), cart_panel: read('cart/views/partials/cart-panel.hbs')});
const imageId = '11111111-1111-4111-8111-111111111111';
const product = {id: 'visual-product', name: 'Florero Ondas', slug: 'florero-ondas', description: 'Producto de prueba visual', primaryImage: {id: imageId, alt: '', width: 800, height: 1000}};
const variant = {id: 'visual-variant', name: 'Azul', priceMinor: 2860000, currency: 'ARS', supplyMode: 'stock', material: null, color: null};
const requests: {path: string; body: unknown}[] = [];
const assets: Record<string, string> = {
  '/assets/storefront/cart.css': 'cart/public/cart.css', '/assets/storefront/shell.css': 'shell/public/shell.css',
  '/assets/storefront/generated/cart.js': 'cart/public/generated/cart.js',
  ...Object.fromEntries(['figtree-variable.woff2', 'dm-mono-regular.woff2', 'dm-mono-medium.woff2'].map(name => [`/assets/storefront/fonts/${name}`, `shell/public/fonts/${name}`])),
};
const seed = `if (!sessionStorage.getItem('visual-shipping-seeded')) {
  localStorage.setItem('storefront-cart-v1-api', JSON.stringify([{productId:'visual-product',variantId:'visual-variant',quantity:1}]));
  sessionStorage.setItem('visual-shipping-seeded','1');
}`;

async function start() {
  const html = await new Promise<string>((accept, reject) => engine.__express(resolve(views, 'cart/views/cart.hbs'),
    {layout: false, brand: 'Mali Deco', mode: 'api', routes: canonicalRoutes}, (error, result) => error ? reject(error) : accept(result!)));
  const page = html.replace('<script src="/assets/storefront/generated/cart.js"', '<script src="/fixture.js" defer></script><script src="/assets/storefront/generated/cart.js"')
    .replace('<h1>Tu carrito</h1>', '<h1>Tu carrito</h1><p class="cart-demo-notice">Vista de prueba · productos y tarifas simulados. Sin compras ni envíos reales.</p>');
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const send = (body: unknown) => {response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body));};
    if (request.method === 'GET') {
      if (path === '/carrito') {response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page); return;}
      if (path === '/fixture.js') {response.setHeader('Content-Type', 'text/javascript'); response.end(seed); return;}
      if (path === '/__fixture/calls') {send(requests); return;}
      if (assets[path]) {response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'font/woff2'); response.end(readFileSync(resolve(views, assets[path]))); return;}
      if (path === `/api/v1/catalog/images/${imageId}`) {response.setHeader('Content-Type', 'image/webp'); response.end(readFileSync(resolve(root, 'resources/storefront/florero-ondas.webp'))); return;}
      if (path === '/api/v1/catalog/theme.css') {response.setHeader('Content-Type', 'text/css'); response.end(':root{--blue:#073dcc;--primary-ink:#073dcc}'); return;}
    }
    if (request.method !== 'POST' || !['/api/v1/catalog/cart/resolve', '/api/v1/shipping/destination', '/api/v1/shipping/quote'].includes(path)) {response.statusCode=404; response.end(); return;}
    let raw = ''; for await (const part of request) {raw += part; if (raw.length > 12000) {response.statusCode=413; response.end(); return;}}
    let body; try {body = JSON.parse(raw);} catch {response.statusCode=400; response.end(); return;}
    requests.push({path, body});
    if (path.endsWith('/resolve')) {send({resolved: (body.lines ?? []).map(() => ({productId: product.id, variantId: variant.id, product, variant})), missing: []}); return;}
    if (path.endsWith('/destination')) {
      const candidate = {id: 'A'.repeat(24), label: 'MAR DEL PLATA · BUENOS AIRES'};
      send(body.postalCode === '9999' ? {status: 'unavailable'} : body.postalCode === '0000' ? {status: 'not_found'} :
        body.postalCode === '7600' ? {status: 'ambiguous', candidates: [candidate, {id:'B'.repeat(24),label:'OTRA LOCALIDAD · PRUEBA'}]} : {status: 'resolved', candidate}); return;
    }
    const now=Date.now();
    const service = (carrierId: number, carrierName: string, amountMinor: string) => ({carrierId, carrierName, amountMinor, currency:'ARS', serviceCode:'standard_delivery', serviceName:'Entrega a domicilio', logisticType:'carrier_dropoff'});
    send({status:'quoted', packageCount:1, quotedAt:now, validUntil:now+300000, options: [
      service(1,'Correo · prueba','936824'), service(2,'Entrega rápida · prueba','3089539'), service(3,'Servicio adicional · prueba','1220000'),
      {...service(4,'Retiro en sucursal · prueba','671300'), serviceCode:'pickup_point', serviceName:'Retiro en un punto', pickupPoints:[{id:71,description:'Sucursal Centro · Dirección de prueba 123'},{id:72,description:'Sucursal Puerto · Dirección de prueba 456'}]},
      {...service(5,'Otro punto de retiro · prueba','952012'), serviceCode:'pickup_point', serviceName:'Retiro en un punto', pickupPoints:[{id:81,description:'Sucursal Norte · Dirección de prueba 789'}]},
    ]});
  });
  server.listen(0, '127.0.0.1', () => console.log(`Visual fixture: http://127.0.0.1:${(server.address() as {port:number}).port}/carrito`));
}
void start();
