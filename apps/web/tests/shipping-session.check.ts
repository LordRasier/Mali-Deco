import assert from 'node:assert/strict';
import { ShippingSession, readSavedDestinationHint, readSavedPostalCode } from '../src/lib/shipping-session';

async function check() {
  const lines = [{productId:'p1',variantId:'v1',quantity:1}], wait = () => new Promise(resolve => setTimeout(resolve,650));
  const a = {id:'A'.repeat(24),label:'MAR DEL PLATA · BUENOS AIRES'}, b = {id:'B'.repeat(24),label:'BARRIO CAISAMAR · BUENOS AIRES'};
  const option = {carrierId:1,carrierName:'Correo',serviceCode:'pickup_point',serviceName:'Sucursal',logisticType:'carrier_dropoff',amountMinor:'12345',currency:'ARS',pickupPoints:[{id:7,description:'Sucursal'}]};
  let clock = Date.now(), lookups = 0, quotes = 0;
  const session = new ShippingSession(async (url,init) => {
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    if (url === '/api/v1/shipping/destination') { lookups++; return Response.json(body.postalCode === '7600' ? {status:'ambiguous',candidates:[a,b]} : {status:'not_found'}); }
    quotes++; assert.equal(url,'/api/v1/shipping/quote'); assert.deepEqual(body.destination,{postalCode:'7600',candidateId:a.id});
    return Response.json({status:'quoted',options:[option],packageCount:1,quotedAt:clock,validUntil:clock+300000});
  }, () => clock);
  session.syncCart('api',lines,false,'ARS:2450000');
  session.setPostalCode('76'); await wait(); assert.equal(lookups,0);
  session.setPostalCode('7600'); await wait(); assert.equal(lookups,1); assert.equal(quotes,0); assert.equal(session.getSnapshot().lookup.status,'ambiguous');
  session.selectDestination(a.id); await wait(); assert.equal(quotes,1);
  session.select(0,7); assert.equal(session.getSnapshot().selection?.choiceKey,'0:7');
  const deadline=session.getSnapshot().selection?.shipping.validUntil;
  session.syncCart('api',lines,true,''); session.syncCart('api',lines,false,'ARS:2450000'); await wait();
  assert.equal(quotes,1,'revalidating unchanged cart must not create a quote');
  assert.equal(session.getSnapshot().selection?.shipping.validUntil,deadline);
  session.syncCart('api',[{...lines[0],quantity:2}],false,'ARS:4900000');
  assert.equal(session.getSnapshot().selection,null); assert.equal(session.getSnapshot().quote,null);
  await wait(); assert.equal(lookups,1); assert.equal(quotes,2);
  session.select(0,7);
  const originalExpiry=session.getSnapshot().selection?.shipping.validUntil;
  clock += 299000;
  // Returning to the same cart must keep the original deadline, never extend it.
  session.syncCart('api',[{...lines[0],quantity:2}],true,'');
  session.syncCart('api',[{...lines[0],quantity:2}],false,'ARS:4900000'); session.activate();
  assert.equal(session.getSnapshot().selection?.shipping.validUntil,originalExpiry);
  assert.equal(session.getSnapshot().candidateId,a.id); assert.equal(quotes,2);
  clock += 1001; session.expireIfNeeded();
  assert.equal(session.getSnapshot().selection,null); assert.equal(session.getSnapshot().expired,true);
  assert.equal(session.getSnapshot().candidateId,a.id);
  session.setPostalCode('7601'); assert.equal(session.getSnapshot().quote,null); await wait(); assert.equal(session.getSnapshot().lookup.status,'not_found');
  session.syncCart('demo',lines,false); session.setPostalCode('7600'); await wait(); assert.equal(lookups,2); assert.equal(quotes,2);
  assert.equal(readSavedPostalCode('7600'),'7600'); assert.equal(readSavedPostalCode('x'.repeat(17)),null);
  session.dispose();

  let release!: (value: Response) => void; let staleCalls = 0;
  const stale = new ShippingSession(async () => { staleCalls++; return new Promise<Response>(resolve => {release=resolve;}); });
  stale.syncCart('api',lines,false); stale.setPostalCode('7600'); await wait(); assert.equal(staleCalls,1);
  stale.setPostalCode('7601'); release(Response.json({status:'resolved',candidate:a}));
  assert.equal(stale.getSnapshot().postalCode,'7601'); assert.notEqual(stale.getSnapshot().lookup.status,'resolved');
  stale.dispose();

  let uniqueLookups=0, uniqueQuotes=0;
  const unique = new ShippingSession(async url => {
    if (url === '/api/v1/shipping/destination') { uniqueLookups++; return Response.json({status:'resolved',candidate:a}); }
    uniqueQuotes++; return Response.json({status:'quoted',options:[option],packageCount:1,quotedAt:Date.now(),validUntil:Date.now()+299000});
  });
  unique.syncCart('api',lines,false); unique.syncCart('api',lines,false);
  unique.setPostalCode('7'); unique.setPostalCode('76'); unique.setPostalCode('760'); unique.setPostalCode('7600');
  await wait(); assert.equal(uniqueLookups,1); assert.equal(uniqueQuotes,1); assert.equal(unique.getSnapshot().lookup.status,'resolved');
  unique.dispose();

  let finishQuote!:(value:Response)=>void;
  const late = new ShippingSession(async url => url === '/api/v1/shipping/destination' ? Response.json({status:'resolved',candidate:a}) : new Promise<Response>(resolve => {finishQuote=resolve;}));
  late.syncCart('api',lines,false); late.setPostalCode('7600'); await wait();
  late.setPostalCode('7601'); finishQuote(Response.json({status:'quoted',options:[option],packageCount:1,quotedAt:Date.now(),validUntil:Date.now()+299000}));
  await Promise.resolve(); assert.equal(late.getSnapshot().quote,null); assert.equal(late.getSnapshot().postalCode,'7601'); late.dispose();

  let failCalls=0;
  const failed = new ShippingSession(async () => {failCalls++; throw new Error('offline');});
  failed.syncCart('api',lines,false); failed.setPostalCode('7600'); await wait();
  assert.equal(failed.getSnapshot().lookup.status,'unavailable'); assert.equal(failCalls,1); failed.dispose();

  let restoredLookups=0, restoredEstimates=0;
  const restored = new ShippingSession(async url => {
    if (url === '/api/v1/shipping/destination') { restoredLookups++; return Response.json({status:'ambiguous',candidates:[a,b]}); }
    restoredEstimates++; throw new Error('checkout must not estimate');
  });
  restored.setEstimateEnabled(false);
  restored.syncCart('api',lines,false);
  restored.setPostalCode(readSavedPostalCode('7600')!);
  await wait();
  assert.equal(restoredLookups,1); assert.equal(restored.getSnapshot().candidateId,null);
  restored.selectDestination(b.id); await wait();
  assert.equal(restored.getSnapshot().candidateId,b.id); assert.equal(restoredEstimates,0);
  restored.invalidateDestination();
  assert.equal(restored.getSnapshot().postalCode,'7600'); assert.equal(restored.getSnapshot().candidateId,null);
  await wait(); assert.equal(restoredLookups,1,'an evicted destination must wait for an explicit lookup');
  restored.dispose();
  const hint=readSavedDestinationHint(JSON.stringify({postalCode:'7600',candidateId:b.id}));
  assert.deepEqual(hint,{postalCode:'7600',candidateId:b.id});
  assert.equal(readSavedDestinationHint('{bad'),null); assert.equal(readSavedDestinationHint(JSON.stringify({postalCode:'7600',candidateId:'bad'})),null);
  const resumed = new ShippingSession(async () => Response.json({status:'ambiguous',candidates:[a,b]}));
  resumed.setEstimateEnabled(false); resumed.syncCart('api',lines,false); resumed.restoreDestinationHint(hint); resumed.setPostalCode('7600'); await resumed.lookup();
  assert.equal(resumed.getSnapshot().candidateId,b.id,'only a freshly verified candidate may be restored');
  resumed.syncCart('demo',lines,false); assert.equal(resumed.getSnapshot().candidateId,null,'a different catalog mode cannot inherit another mode’s candidate');
  resumed.dispose();
  const evicted = new ShippingSession(async () => Response.json({status:'ambiguous',candidates:[a,{...b,id:'C'.repeat(24)}]}));
  evicted.setEstimateEnabled(false); evicted.syncCart('api',lines,false); evicted.restoreDestinationHint(hint); evicted.setPostalCode('7600'); await evicted.lookup();
  assert.equal(evicted.getSnapshot().candidateId,null,'old tokens must never guess a replacement'); evicted.dispose();
}
void check().catch(error => { console.error(error); process.exitCode = 1; });
