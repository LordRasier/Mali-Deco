/** Synthetic browser checkout; all requests are intercepted, no credentials or real payment APIs. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { URL } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
require('tsx/cjs'); require('reflect-metadata');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const { MvcCheckoutController } = require('../../src/presentation/checkout/checkout.controller.ts');
const hbs = require('hbs').create();
for (const name of ['site_header', 'site_footer', 'cart_panel']) hbs.registerPartial(name, '');
const html = hbs.handlebars.compile(readFileSync('src/presentation/checkout/views/checkout.hbs', 'utf8'))({ ready: true, newOrdersEnabled: true, paymentAvailable: true, brand: 'Checkout QA', routes: { home: '/', cart: '/carrito', catalog: '/catalogo', product: '/productos' } });
let returnedHtml = '';
new MvcCheckoutController({}).returned({ type() { return { send(body) { returnedHtml = body; } }; } });
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  import { mountCheckout } from './src/presentation/checkout/client/browser/checkout-browser';
  const listeners = new Set<() => void>();
  let shipping = { mode:'api', cartKey:null, postalCode:'7600', candidateId:'city', lookup:{status:'resolved',candidates:[{id:'city',label:'Mar del Plata'}]}, quote:null, selection:null, loading:false,error:false,expired:false,estimateEnabled:false };
  const session = { getSnapshot:()=>shipping, subscribe:(fn:any)=>{listeners.add(fn);return ()=>listeners.delete(fn);},setEstimateEnabled(){},syncCart(){},setPostalCode(value:string){shipping={...shipping,postalCode:value};for(const fn of listeners)fn();},selectDestination(){},lookup:async()=>{},invalidateDestination(){} };
  const cart = { ready:true,status:'idle',unresolved:false,items:[{productId:'p',variantId:'v',quantity:1,product:{id:'p',slug:'florero',name:'Florero Ondas',description:'',variants:[]},variant:{id:'v',name:'PLA',priceMinor:1800000,currency:'ARS'}}],totals:{ARS:1800000n},count:1,bulkWarnings:[],stockShortage:false,removedNotice:0,storageUnavailable:false,storageTabOnly:false };
  const checkout = mountCheckout(document.querySelector('[data-checkout-root]')!, { cart:{getSnapshot:()=>cart,subscribe:()=>()=>{}}, shippingSession:session, setCartLocked(){} } as any);
  if (!checkout.store.getSnapshot().pending) void checkout.store.requestQuote();
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const origin = 'https://checkout-ui.test', paymentUrl = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-fixture';
let order, created = 0, starts = 0, refreshed = 0, status = 'rejected';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(paymentUrl).origin) return route.fulfill({ contentType: 'text/html', body: '<a href="' + origin + '/checkout/return?status=approved">Volver a la tienda</a>' });
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/checkout/return') return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }, body: returnedHtml });
    if (url.pathname === '/checkout') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.endsWith('/generated/cart.js')) return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
    const css = { '/assets/checkout/checkout.css': 'src/presentation/checkout/public/checkout.css', '/assets/storefront/cart.css': 'src/presentation/cart/public/cart.css', '/assets/storefront/shell.css': 'src/presentation/shell/public/shell.css' }[url.pathname];
    if (css) return route.fulfill({ contentType: 'text/css', body: readFileSync(css, 'utf8') });
    if (!url.pathname.startsWith('/api/v1/checkout/')) return route.fulfill({ status: 404, body: '' });
    if (/\/session(?:\/resume)?$/.test(url.pathname)) {
      if (url.pathname.endsWith('/resume')) assert.match(req.headers().cookie ?? '', /store_checkout=synthetic-session/);
      return route.fulfill({ json: { csrf: 'fixture-csrf' }, headers: { 'Set-Cookie': 'store_checkout=synthetic-session; Path=/; Secure; HttpOnly; SameSite=Strict' } });
    }
    assert.equal(req.headers()['x-csrf-token'], 'fixture-csrf');
    if (url.pathname.endsWith('/quotes')) return route.fulfill({ json: { quoteId: 'q', validUntil: Date.now() + 300000, options: [{ id: 'delivery', carrierName: 'Correo', serviceName: 'A domicilio', serviceCode: 'home', currency: 'ARS', amountMinor: '250000' }] } });
    if (url.pathname.endsWith('/orders')) {
      created++; const input = req.postDataJSON(); assert.ok(req.headers()['idempotency-key']);
      order = { id:'ca665af8-41b6-4ba4-bb75-54cf9c0f142e',totalMinor:'2050000',currency:'ARS',orderStatus:'received',paymentStatus:'pending',fulfillmentStatus:'not_started',shippingStatus:'not_started',testLocal:false,paymentAvailable:true,checkout:{contact:input.contact,address:input.address,postalCode:'7600',delivery:'Correo / A domicilio',lines:[{name:'Florero Ondas',variantName:'PLA',quantity:1,unitPriceMinor:'1800000',lineTotalMinor:'1800000',currency:'ARS'}]} };
      return route.fulfill({ json: order });
    }
    if (url.pathname.endsWith('/order-attempt')) return route.fulfill({ json: { status: 'completed', order } });
    if (url.pathname.endsWith('/payments/start')) { starts++; return route.fulfill({ json: { status: 'ready', url: paymentUrl } }); }
    if (url.pathname.endsWith('/payments/refresh')) { refreshed++; return route.fulfill({ json: { status } }); }
    throw Error('Unexpected test request');
  });
  await page.goto(origin + '/checkout');
  await page.locator('[data-checkout-options] input').check();
  assert.equal(await page.locator('[data-checkout-payment]').isChecked(), true);
  assert.equal(await page.locator('[data-checkout-payment]').isDisabled(), false);
  assert.equal(await page.locator('[data-checkout-submit]').isDisabled(), true);
  for (const [name, value] of Object.entries({ name:'Comprador de prueba',email:'buyer@example.test',phone:'2230000000',street:'Calle de prueba',number:'123' })) await page.locator('[data-checkout-' + name + ']').fill(value);
  await page.waitForFunction(() => !globalThis.document.querySelector('[data-checkout-submit]').disabled);
  assert.match(await page.locator('[data-checkout-submit]').textContent(), /20.500,00/);
  mkdirSync('.local-tools/checkout-ui', { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.screenshot({ path: '.local-tools/checkout-ui/checkout-' + width + '.png', fullPage: true });
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true, 'Overflow at ' + width);
  }
  await page.locator('[data-checkout-submit]').click(); await page.waitForURL(paymentUrl);
  assert.equal(created, 1); assert.equal(starts, 1);
  await page.getByRole('link', { name:'Volver a la tienda' }).click(); await page.waitForURL(origin + '/checkout');
  await page.locator('[data-checkout-payment-start]').waitFor();
  assert.match(await page.locator('[data-checkout-payment-message]').textContent(), /no se complet/);
  assert.equal(await page.locator('[data-checkout-name]').inputValue(), 'Comprador de prueba');
  assert.equal(await page.locator('[data-checkout-street]').inputValue(), 'Calle de prueba');
  assert.equal(await page.locator('[data-checkout-form]').isVisible(), true);
  assert.equal(await page.locator('[data-checkout-new-order]').isVisible(), false);
  await page.reload(); await page.locator('[data-checkout-payment-start]').waitFor();
  assert.equal(created, 1); assert.equal(starts, 1); assert.ok(refreshed >= 2);
  status = 'approved'; await page.locator('[data-checkout-payment-start]').click(); await page.waitForURL(paymentUrl);
  await page.getByRole('link', { name:'Volver a la tienda' }).click(); await page.waitForURL(origin + '/checkout');
  await page.getByRole('heading', { name: 'Pago aprobado', exact: true }).waitFor();
  assert.equal(created, 1); assert.equal(starts, 2); assert.deepEqual(errors, []);
  process.stdout.write('PASS: select/pay, same-tab redirect, ignored return query, rejection/reload recovery, retry and approval; 1280/390px without overflow.\n');
} finally { await browser.close(); }
