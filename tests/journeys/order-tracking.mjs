/** Offline browser journey. All data and fetch responses are synthetic; no email or production requests. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
const require = createRequire(import.meta.url), hbs = require('hbs').create();
hbs.registerPartial('site_footer', '');
const markup = hbs.handlebars.compile(readFileSync('src/presentation/tracking/views/tracking.hbs', 'utf8'))({ brand: 'MALI', routes: { home: '/', catalog: '/catalogo' } });
const css = ['cart/public/cart.css', 'shell/public/shell.css', 'tracking/public/tracking.css'].map(p => readFileSync('src/presentation/' + p, 'utf8')).join('\n').replace(/url\([^)]*\)/g, 'none').replace(/@import[^;]*;/g, '');
const client = readFileSync('src/presentation/tracking/public/tracking.js', 'utf8');
const chrome = process.env.CHROMIUM_EXECUTABLE;
const prepareOnly = process.argv.includes('--prepare');
if (!chrome && !prepareOnly) throw Error('Set CHROMIUM_EXECUTABLE to an installed Chromium/Chrome executable.');
const output = resolve('.local-tools/tracking-ui'); mkdirSync(output, { recursive: true });
const steps = ['Pedido recibido', 'Pago confirmado', 'En preparación', 'En camino', 'Entregado'].map((label, i) => ({ label, state: i < 2 ? 'complete' : i === 2 ? 'current' : 'pending' }));
const order = { id: 'order-1', reference: '5D4470F6', createdAt: '2026-11-13T00:35:00Z', updatedAt: '2026-11-13T15:10:00Z', currency: 'ARS', totalMinor: '2450000', test: false, status: 'En preparación', exception: '', steps,
  payment: 'Aprobado', fulfillment: 'En preparación', shippingStatus: 'No iniciado', customer: 'Cliente de prueba', email: 'buyer@example.test',
  delivery: { carrier: 'Correo', service: 'A domicilio', amountMinor: '450000', address: 'Calle de prueba 123', city: 'Mar del Plata · Buenos Aires · 7600', pickup: '' }, trackingNumber: '', trackingUrl: '',
  lines: [{ name: 'Florero Ondas', variant: 'PLA · Arena', quantity: 1, unitPriceMinor: '1200000', lineTotalMinor: '1200000' }, { name: 'Maceta Geométrica', variant: 'PLA · Oliva', quantity: 1, unitPriceMinor: '800000', lineTotalMinor: '800000' }] };
for (const [name, width, screen] of [['request-desktop', 1280, 'request'], ['orders-desktop', 1280, 'orders'], ['orders-mobile', 390, 'orders'], ['request-mobile', 390, 'request']]) {
  const token = 'a'.repeat(64), state = { authorized: false, issued: 0, reads: 0 };
  const setup = `globalThis.fixture=${JSON.stringify({ order, token, state })};
    globalThis.fetch=async (url, options)=>{const f=globalThis.fixture, input=JSON.parse(options.body);if(String(url).includes(f.token))throw Error('Token leaked in URL');
      if(url.endsWith('/request')){f.state.issued++;return Response.json({message:'Si hay pedidos asociados a ese correo, vas a recibir un enlace para consultarlos.'});}
      if(url.endsWith('/access')){f.state.authorized=input.token===f.token;return Response.json({}, {status:f.state.authorized?200:403});}
      if(url.endsWith('/logout')){f.state.authorized=false;return Response.json({});}
      if(!f.state.authorized)return Response.json({}, {status:403});f.state.reads++;
      return Response.json({email:'buyer@example.test',items:[f.order,{...f.order,id:'order-2',reference:'A14B82C9',test:true,status:'Esperando el pago',payment:'Pendiente',fulfillment:'No iniciado',steps:f.order.steps.map((s,i)=>({...s,state:i===0?'current':'pending'}))}],page:input.page,total:12,pageSize:10});};`;
  const checks = `const wait=async(fn)=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out');};
    (async()=>{const check=(value,message)=>{if(!value)throw Error(message);};
      await wait(()=>!document.querySelector('[data-${screen === 'orders' ? 'orders-panel' : 'access'}]').hidden);
      if(${JSON.stringify(screen)}==='orders'){
        const first=document.querySelector('details');first.querySelector('summary').click();await wait(()=>first.open);
        check(first.textContent.includes('Pago: Aprobado'),'Payment detail missing');check(first.textContent.includes('Florero Ondas'),'Items missing');
        document.querySelector('[data-refresh]').click();await wait(()=>!document.querySelector('[data-refresh]').disabled);check(document.querySelector('details').open,'Expanded state lost');
        document.querySelector('[data-next]').click();await wait(()=>document.querySelector('[data-page]').textContent==='2 de 2');
        document.querySelector('[data-previous]').click();await wait(()=>document.querySelector('[data-page]').textContent==='1 de 2');
        document.querySelector('[data-logout]').click();await wait(()=>!document.querySelector('[data-access]').hidden);check(!document.querySelector('[data-order-list]').children.length,'Private data retained after logout');
        globalThis.fixture.state.authorized=true;await globalThis.fetch('/api/v1/order-tracking/access',{body:JSON.stringify({token:globalThis.fixture.token})});
        window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));await wait(()=>!document.querySelector('[data-orders-panel]').hidden);document.querySelector('details summary').click();
      }else{const input=document.querySelector('[name=email]');input.value='buyer@example.test';document.querySelector('[data-request-form]').requestSubmit();await wait(()=>globalThis.fixture.state.issued===1);await wait(()=>!document.querySelector('[data-request-button]').disabled);}
      check(innerWidth===${width},'Unexpected viewport width');check(document.documentElement.scrollWidth<=innerWidth,'Horizontal page overflow');check(!location.hash,'Token retained in address');
      document.body.dataset.journey='passed';
    })().catch(error=>{document.body.dataset.journey='failed';document.body.dataset.failure=error.message;});`;
  const body = markup.replace(/<link\b[^>]*>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<img\b[^>]*>/g, '<span>MALI</span>')
    .replace('</head>', `<style>${css}</style></head>`).replace('</body>', `<script>${setup}\n${client}\n${checks}</script></body>`);
  const file = join(output, name + '.html'); writeFileSync(file, body);
  if (prepareOnly) { process.stdout.write(`Prepared ${name}\n`); continue; }
  const profile = mkdtempSync(join(tmpdir(), 'mali-tracking-browser-'));
  const args = ['--headless', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + profile,
    '--window-size=' + width + ',1100', '--force-device-scale-factor=1', '--virtual-time-budget=6000', '--screenshot=' + join(output, name + '.png'), '--dump-dom', pathToFileURL(file).href + (screen === 'orders' ? '#' + token : '')];
  const dom = execFileSync(chrome, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(dom, /data-journey="passed"/, dom.match(/data-failure="([^"]*)"/)?.[1] || 'Browser checks did not complete');
  process.stdout.write(`PASS ${name}: form, private list, timeline, details, pagination, logout, refresh and overflow checks.\n`);
}
