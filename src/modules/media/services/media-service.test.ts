import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { MediaService } from './media-service';
import type { MediaRepository } from '../persistence/media-repository';
import type { ImageDerivatives } from '../processing/image-processor';

const product = 'b1a0fa70-a50a-4d84-8936-530496c8e4b0';
const key = 'a7373837-b838-4804-babc-57369dffce3d';
const image = '93e8b8ae-c282-4ecd-ac49-ab246d865985';
const file = async () => { const buffer = await sharp({create:{width:80,height:120,channels:3,background:'red'}}).png().toBuffer(); return {buffer,size:buffer.length}; };
const repository = (overrides: object = {}) => ({
  findUpload: async () => null,
  save: async (_product:string, _revision:number, input:{id:string}) => ({ revision:1, items:[], replay:false, imageId:input.id }),
  readAdmin: async () => null, readPublic: async () => null,
  restore: async () => ({revision:1,items:[]}), ...overrides,
}) as unknown as MediaRepository;

test('upload submits normalized derivatives and metadata together', async () => {
  let saves = 0;
  const repo = repository({ save: async (_product:string, _revision:number, input:{id:string;alt:string}, derivatives:ImageDerivatives) => {
    saves++; assert.equal(input.alt,'Imagen de prueba'); assert.deepEqual(Object.keys(derivatives).sort(),['1600','320','800']);
    for (const bytes of Object.values(derivatives)) assert.equal((await sharp(bytes).metadata()).format,'webp');
    return {revision:1,items:[],imageId:input.id,replay:false};
  } });
  await new MediaService(repo).upload(product, 0, key, await file(), 'Imagen de prueba');
  assert.equal(saves,1);
});

test('idempotent replay avoids processing and unknown database errors are sanitized', async () => {
  const existing = { revision:1, items:[], replay:true, imageId:image };
  assert.deepEqual(await new MediaService(repository({findUpload:async()=>existing})).upload(product,0,key,await file(),''),existing);
  const blocked = new MediaService(repository({save:async()=>{ throw new Error('private SQL'); }}));
  await assert.rejects(blocked.upload(product,0,key,await file(),''), {status:503,message:'Image storage unavailable'});
  await assert.rejects(blocked.upload(product,0,key,{buffer:Buffer.from('bad'),size:3},''), {status:400});
});

test('reads enforce public or product-specific eligibility through the repository', async () => {
  const service = new MediaService(repository({readAdmin:async()=>Buffer.from('webp')}));
  assert.equal((await service.readAdmin(product,image,320)).toString(),'webp');
  await assert.rejects(service.readPublic(image,320), {status:404});
});

test('only one upload remains admitted while the first operation is unsettled', async () => {
  let release!: () => void;
  const repo = repository({findUpload:async()=>new Promise<null>(resolve => { release = () => resolve(null); })});
  const service = new MediaService(repo), input = await file();
  const first = service.upload(product,0,key,input,'');
  await new Promise<void>(resolve => setImmediate(resolve));
  await assert.rejects(service.upload(product,0,key,input,''), {status:429});
  release(); await first;
});
