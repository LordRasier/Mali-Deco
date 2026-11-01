import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { ShippingQuoteController, ShippingQuoteService } from './catalog-quote';
import { PostalCodeResolver } from './postal-code-resolver';

test('the controller resolves selected postal candidates on the server before quoting', async () => {
  const oldEnv = {...process.env};
  process.env.NODE_ENV='development'; process.env.PORT='3001'; process.env.ZIPNOVA_OPERATOR_ORIGIN='http://127.0.0.1:3000'; process.env.ZIPNOVA_ENABLED='true';
  try {
    const resolver = new PostalCodeResolver(async () => new Response(JSON.stringify([{localidad:'MAR DEL PLATA',provincia:'BUENOS AIRES',codigosPostales:['7600']}]),{status:200}));
    let calls=0;
    const service = new ShippingQuoteService(async intent => { calls++; assert.deepEqual(intent.destination,{country:'AR',postalCode:'7600',city:'MAR DEL PLATA',state:'BUENOS AIRES'}); return {status:'unavailable',reason:'NO_OPTIONS'}; },true);
    const controller = new ShippingQuoteController(service,resolver);
    const req = {method:'POST',headers:{host:'127.0.0.1:3001',origin:'http://127.0.0.1:3000','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}} as unknown as IncomingMessage;
    const lookup = await controller.destination({postalCode:'7600'},req);
    assert.equal(lookup.status,'resolved');
    if (lookup.status !== 'resolved') throw new Error('Expected candidate');
    const body = {lines:[{productId:'p1',variantId:'v1',quantity:1}],destination:{postalCode:'7600',candidateId:lookup.candidate.id}};
    assert.deepEqual(await controller.quote(body,req),{status:'unavailable',reason:'NO_OPTIONS'});
    assert.deepEqual(await controller.quote({...body,destination:{...body.destination,postalCode:'7601'}},req),{status:'unavailable',reason:'INVALID_DESTINATION'});
    await assert.rejects(async () => controller.quote({...body,destination:{...body.destination,city:'Fake'}},req));
    assert.equal(calls,1);
  } finally { process.env=oldEnv; }
});
