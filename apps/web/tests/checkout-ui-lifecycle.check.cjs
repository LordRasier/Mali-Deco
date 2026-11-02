/* global require, global, Response, process, console */
/* eslint-disable @typescript-eslint/no-require-imports -- Hook probe uses the repository CommonJS runner. */
const assert = require('node:assert/strict');
const React = require('react');
require('tsx/cjs');
const { hookRunner } = require('./hook-runner.cjs');
const cartPath = require.resolve('../src/hooks/useCart.ts');
let cart = { ready:true, items:[{productId:'p',variantId:'v',quantity:1,product:{name:'Mesa'},variant:{}}], count:1, unresolved:false };
require.cache[cartPath] = { id:cartPath, filename:cartPath, loaded:true, exports:{useCart:()=>cart} };
let focused = [];
const jsxRuntime = require('react/jsx-runtime');
for (const name of ['jsx', 'jsxs']) {
  const original = jsxRuntime[name];
  jsxRuntime[name] = (type, props, ...rest) => {
    if (typeof type === 'string' && props?.ref && typeof props.ref === 'object') props.ref.current = { focus: () => focused.push(props.role) };
    return original(type, props, ...rest);
  };
}
const createElement = React.createElement;
React.createElement = (type, props, ...children) => {
  if (typeof type === 'string' && props?.ref && typeof props.ref === 'object') props.ref.current = { focus: () => focused.push(props.role) };
  return createElement(type, props, ...children);
};
const Checkout = require('../src/components/CheckoutView.tsx').default;
const { CheckoutShipping } = require('../src/components/CheckoutShipping.tsx');
const { CheckoutContact } = require('../src/components/CheckoutContact.tsx');
const storage = new Map();
global.sessionStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
Object.defineProperty(global, 'navigator', { value: { locks: { request: (_name, action) => action() } }, configurable: true });
const json = data => new Response(JSON.stringify(data),{status:200});
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
function find(node, pred) { if (!node || typeof node !== 'object') return; if (pred(node)) return node; if (node.type === CheckoutContact) return find(CheckoutContact(node.props), pred); for (const child of React.Children.toArray(node.props?.children)) { const result=find(child,pred); if(result) return result; } }
function button(r,label) { return find(r.output,n=>n.type==='button' && n.props.children===label); }
function byId(r,id) { const value=find(r.output,n=>n.props?.id===id); assert.ok(value,`missing ${id}`); return value; }
async function main() {
  const calls=[]; let lookup=deferred(), quote=deferred(), order=deferred();
  global.fetch=(url,options)=>{ calls.push({url,options}); if(url.endsWith('/session')) return Promise.resolve(json({csrf:'csrf'})); if(url.endsWith('/destination')) return lookup.promise; if(url.endsWith('/quotes')) return quote.promise; if(url.endsWith('/orders')) return order.promise; if(url.endsWith('/session/resume')) return Promise.resolve(json({csrf:'resumed'})); if(url.endsWith('/order-attempt')) return Promise.resolve(json({status:'unknown'})); throw Error(url); };
  let r=hookRunner(React,()=>Checkout({brand:'Mali'})); await r.settle();
  const shipping=()=>find(r.output,n=>n.type===CheckoutShipping).props;
  focused=[]; shipping().setPostalCode('bad'); r.flush(); shipping().lookup(); lookup.resolve(json({status:'invalid'})); await r.settle(); assert.deepEqual(focused,[]);
  lookup=deferred(); shipping().setPostalCode('1000'); r.flush(); shipping().lookup(); r.flush(); lookup.resolve(json({status:'resolved',candidate:{id:'city',label:'City'}})); await r.settle();
  shipping().requestQuote(); await r.settle(); cart={...cart,items:[{...cart.items[0],quantity:2}]}; r.flush(); quote.resolve(json({quoteId:'old',validUntil:Date.now()+10000,options:[]})); await r.settle(); assert.equal(shipping().quote,null);
  quote=deferred(); shipping().requestQuote(); await r.settle(); quote.resolve(json({quoteId:'q',validUntil:Date.now()+10000,options:[{id:'o',carrierName:'C',serviceName:'S',serviceCode:'home',amountMinor:'100',currency:'ARS'}]})); await r.settle(); shipping().setOptionId('o'); r.flush();
  for(const [id,value] of [['name','Personal Name'],['email','a@example.com'],['phone','123'],['street','Private Street'],['number','10']]) {byId(r,'checkout-'+id).props.onChange({target:{value}}); r.flush();}
  find(r.output,n=>n.type==='form').props.onSubmit({preventDefault(){}}); await r.settle(); assert.equal(calls.filter(c=>c.url.endsWith('/orders')).length,1); assert.equal(storage.size,1); for(const secret of ['Personal','Private','example.com','123']) assert.ok(!JSON.stringify([...storage]).includes(secret));
  focused=[]; order.resolve(new Response('',{status:503})); await r.settle(); assert.deepEqual(focused,['alert']); assert.ok(button(r,'Reintentar el mismo intento')); order=deferred(); button(r,'Reintentar el mismo intento').props.onClick(); await r.settle(); order.resolve(new Response(JSON.stringify({code:'QUOTE_CHANGED'}),{status:409})); await r.settle(); assert.ok(button(r,'Reintentar el mismo intento')); assert.equal(storage.size,1); assert.equal(calls.filter(c=>c.url.endsWith('/orders'))[0].options.headers['Idempotency-Key'], calls.filter(c=>c.url.endsWith('/orders'))[1].options.headers['Idempotency-Key']); r.unmount();
  calls.length=0; focused=[]; r=hookRunner(React,()=>Checkout({brand:'Mali'})); await r.settle(); assert.deepEqual(focused,['alert']); assert.ok(button(r,'Consultar estado del intento')); focused=[]; button(r,'Consultar estado del intento').props.onClick(); await r.settle(); assert.deepEqual(focused,['alert']); assert.deepEqual(calls.map(c=>c.url),['/api/v1/checkout/session/resume','/api/v1/checkout/order-attempt']); assert.ok(button(r,'Consultar estado del intento')); assert.ok(find(r.output,n=>n.type==='input' && n.props.id==='checkout-name').props.disabled); assert.ok(!find(r.output,n=>n.type==='h2' && n.props.children==='Pedido de prueba recibido')); assert.equal(storage.size,1);
  calls.length=0; global.fetch=(url,options)=>{calls.push({url,options}); return Promise.resolve(new Response('',{status:403}));}; button(r,'Consultar estado del intento').props.onClick(); await r.settle(); assert.deepEqual(calls.map(c=>c.url),['/api/v1/checkout/session/resume']); assert.ok(button(r,'Consultar estado del intento')); assert.ok(!button(r,'Reiniciar sesión de compra')); assert.ok(!find(r.output,n=>n.type==='h2' && n.props.children==='Pedido de prueba recibido')); assert.equal(storage.size,1); r.unmount();
  storage.clear(); calls.length=0; lookup=deferred(); quote=deferred(); order=deferred();
  global.fetch=(url,options)=>{ calls.push({url,options}); if(url.endsWith('/session')) return Promise.resolve(json({csrf:'csrf'})); if(url.endsWith('/destination')) return lookup.promise; if(url.endsWith('/quotes')) return quote.promise; if(url.endsWith('/orders')) return order.promise; throw Error(url); };
  r=hookRunner(React,()=>Checkout({brand:'Mali'})); await r.settle();
  const nextShipping=()=>find(r.output,n=>n.type===CheckoutShipping).props;
  nextShipping().setPostalCode('1000'); r.flush(); nextShipping().lookup(); lookup.resolve(json({status:'resolved',candidate:{id:'city',label:'City'}})); await r.settle();
  nextShipping().requestQuote(); await r.settle(); quote.resolve(json({quoteId:'q2',validUntil:Date.now()+10000,options:[{id:'o',carrierName:'C',serviceName:'S',serviceCode:'home',amountMinor:'100',currency:'ARS'}]})); await r.settle(); nextShipping().setOptionId('o'); r.flush();
  find(r.output,n=>n.type==='form').props.onSubmit({preventDefault(){}}); await r.settle();
  order.resolve(new Response(JSON.stringify({code:'QUOTE_CHANGED'}),{status:409})); await r.settle();
  assert.equal(storage.size,0); assert.equal(nextShipping().quote,null); assert.ok(!button(r,'Reintentar el mismo intento')); r.unmount();
  require('../src/lib/checkout-client.ts').resetCheckoutSession();
  storage.clear(); calls.length=0; lookup=deferred();
  global.fetch=(url,options)=>{ calls.push({url,options}); if(url.endsWith('/destination')) return lookup.promise; if(url.endsWith('/session')) return Promise.resolve(new Response(JSON.stringify({code:'CHECKOUT_SESSION_INVALID'}),{status:403})); if(url.endsWith('/session/reset')) return Promise.resolve(json({})); throw Error(url); };
  r=hookRunner(React,()=>Checkout({brand:'Mali'})); await r.settle();
  const expiredShipping=()=>find(r.output,n=>n.type===CheckoutShipping).props;
  expiredShipping().setPostalCode('1000'); r.flush(); expiredShipping().lookup(); lookup.resolve(json({status:'resolved',candidate:{id:'city',label:'City'}})); await r.settle();
  expiredShipping().requestQuote(); await r.settle();
  assert.ok(button(r,'Reiniciar sesión de compra')); button(r,'Reiniciar sesión de compra').props.onClick(); await r.settle();
  assert.deepEqual(calls.map(c=>c.url), ['/api/v1/shipping/destination','/api/v1/checkout/session','/api/v1/checkout/session/reset']);
  assert.equal(storage.size,0); assert.equal(expiredShipping().quote,null); r.unmount();
  calls.length=0; lookup=deferred(); focused=[];
  global.fetch=(url,options)=>{calls.push({url,options}); if(url.endsWith('/destination')) return lookup.promise; if(url.endsWith('/session')) return Promise.resolve(json({csrf:'csrf'})); if(url.endsWith('/quotes')) return Promise.resolve(new Response('',{status:503})); throw Error(url);};
  r=hookRunner(React,()=>Checkout({brand:'Mali'})); await r.settle();
  const failingShipping=()=>find(r.output,n=>n.type===CheckoutShipping).props;
  failingShipping().setPostalCode('1000'); r.flush(); failingShipping().lookup(); lookup.resolve(json({status:'resolved',candidate:{id:'city',label:'City'}})); await r.settle();
  focused=[]; failingShipping().requestQuote(); await r.settle(); assert.deepEqual(focused,['alert']); assert.ok(!button(r,'Reiniciar sesión de compra')); r.unmount();
  require('../src/lib/checkout-client.ts').resetCheckoutSession();
  Object.defineProperty(global, 'navigator', { value: {}, configurable:true });
  lookup=deferred(); calls.length=0;
  global.fetch=(url,options)=>{calls.push({url,options}); if(url.endsWith('/destination')) return lookup.promise; if(url.endsWith('/session')) return Promise.resolve(new Response(JSON.stringify({code:'CHECKOUT_SESSION_INVALID'}),{status:403})); throw Error(url);};
  r=hookRunner(React,()=>Checkout({brand:'Mali'})); await r.settle();
  const noLockShipping=()=>find(r.output,n=>n.type===CheckoutShipping).props;
  noLockShipping().setPostalCode('1000'); r.flush(); noLockShipping().lookup(); lookup.resolve(json({status:'resolved',candidate:{id:'city',label:'City'}})); await r.settle();
  noLockShipping().requestQuote(); await r.settle(); assert.ok(!button(r,'Reiniciar sesión de compra')); assert.ok(find(r.output,n=>n.type==='p' && String(n.props.children).includes('no permite reiniciar'))); r.unmount();
  console.log('checkout UI lifecycle probes passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
