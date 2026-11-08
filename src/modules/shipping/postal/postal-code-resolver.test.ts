import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostalCodeResolver } from './postal-code-resolver';

const mar = {localidad:'MAR DEL PLATA',provincia:'BUENOS AIRES',codigosPostales:['7600']};
const barrio = {localidad:'BARRIO CAISAMAR',provincia:'BUENOS AIRES',codigosPostales:['7600']};
const json = (value: unknown) => new Response(JSON.stringify(value),{status:200});

test('returns explicit candidates and binds opaque selection to the requested code', async () => {
  let calls = 0;
  const lookup = new PostalCodeResolver(async (url, init) => { calls++; assert.equal(String(url), 'https://apis.andreani.com/v1/localidades?codigosPostales=7600&p=1'); assert.equal(init?.redirect,'error'); return json([mar,barrio,mar]); });
  const result = await lookup.lookup('7600');
  assert.equal(result.status, 'ambiguous');
  if (result.status !== 'ambiguous') throw new Error('Expected candidates');
  assert.equal(result.candidates.length,2);
  assert.ok(result.candidates.some(candidate => candidate.label === 'MAR DEL PLATA · BUENOS AIRES'));
  const id = result.candidates.find(candidate => candidate.label.startsWith('MAR DEL PLATA'))!.id;
  assert.deepEqual(lookup.resolve('7600',id), {country:'AR',postalCode:'7600',city:'MAR DEL PLATA',state:'BUENOS AIRES'});
  assert.equal(lookup.resolve('7601',id),null);
  assert.equal((await lookup.lookup('7600')).status,'ambiguous');
  assert.equal(calls,1);
});

test('invalid postal codes never call the provider; unavailable is not cached as not found', async () => {
  let calls = 0;
  const lookup = new PostalCodeResolver(async () => { calls++; if (calls === 1) throw new Error('timeout'); return json([]); });
  assert.equal((await lookup.lookup('76')).status,'invalid');
  assert.equal(calls,0);
  assert.equal((await lookup.lookup('0000')).status,'unavailable');
  assert.equal((await lookup.lookup('0000')).status,'not_found');
  assert.equal((await lookup.lookup('0000')).status,'not_found');
  assert.equal(calls,2);
});

test('coalesces concurrent lookup and expires candidate tokens with the cache', async () => {
  let calls = 0; let clock = Date.now(); let finish!: (value: Response) => void;
  const lookup = new PostalCodeResolver(async () => { calls++; return new Promise<Response>(resolve => { finish=resolve; }); }, () => clock);
  const first = lookup.lookup('7600'), second = lookup.lookup('7600');
  assert.equal(calls,1);
  finish(json([mar]));
  const [a,b] = await Promise.all([first,second]);
  assert.deepEqual(a,b);
  if (a.status !== 'resolved') throw new Error('Expected one candidate');
  assert.ok(lookup.resolve('7600',a.candidate.id));
  clock += 86400001;
  assert.equal(lookup.resolve('7600',a.candidate.id),null);
});

test('refuses mismatched provider data instead of guessing a destination', async () => {
  const lookup = new PostalCodeResolver(async () => json([{...mar,codigosPostales:['9999']}]));
  assert.equal((await lookup.lookup('7600')).status,'unavailable');
});

test('honors provider cooldown and never caches a transient rate limit as missing', async () => {
  let calls=0, clock=1700000000000;
  const lookup=new PostalCodeResolver(async () => { calls++; return calls === 1 ? new Response(null,{status:429,headers:{'Retry-After':'120'}}) : json([mar]); },() => clock);
  assert.equal((await lookup.lookup('7600')).status,'unavailable');
  clock+=119999; assert.equal((await lookup.lookup('7600')).status,'unavailable'); assert.equal(calls,1);
  clock++; assert.equal((await lookup.lookup('7600')).status,'resolved'); assert.equal(calls,2);
});

test('bounds concurrent lookups even for hundreds of distinct valid codes', async () => {
  let calls=0; const releases:((response:Response)=>void)[]=[];
  const lookup=new PostalCodeResolver(async () => {calls++; return new Promise<Response>(resolve => releases.push(resolve));});
  const pending=Array.from({length:501},(_,i) => lookup.lookup(String(i).padStart(4,'0')));
  await new Promise(resolve => setImmediate(resolve)); const started=calls;
  releases.forEach(resolve => resolve(json([])));
  const result=await Promise.all(pending);
  assert.equal(started,2); assert.equal(result.filter(item => item.status === 'unavailable').length,499);
});

test('reads a following page instead of assuming a full page is complete', async () => {
  let calls=0;
  const lookup=new PostalCodeResolver(async url => { calls++; return json(String(url).endsWith('&p=1') ? Array.from({length:2000},() => mar) : []); });
  assert.equal((await lookup.lookup('7600')).status,'resolved'); assert.equal(calls,2);
});
