import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { AdminMediaController, PublicMediaController } from './media.controller';
import { MediaUploadInterceptor } from './media-upload.interceptor';
import { MediaService } from '../services/media-service';

test('HTTP guard runs before multipart parsing; authorized media streams bytes', async () => {
  let allowed = false, intercepted = 0, uploads = 0;
  const original = MediaUploadInterceptor.prototype.intercept;
  MediaUploadInterceptor.prototype.intercept = function (...args) { intercepted++; return original.apply(this, args); };
  const service = {
    upload: async (_product:string, revision:number, _key:string, file:{buffer:Buffer}, alt:string) => {
      uploads++; assert.equal(revision,0); assert.equal(file.buffer.toString(),'synthetic'); assert.equal(alt,'Prueba');
      return {revision:1,items:[]};
    },
    readPublic: async () => Buffer.from('RIFF-test-WEBP'),
  };
  const module = await Test.createTestingModule({
    controllers:[AdminMediaController,PublicMediaController],
    providers:[{provide:MediaService,useValue:service},MediaUploadInterceptor],
  }).overrideGuard(CatalogGuard).useValue({canActivate:()=>allowed}).compile();
  const app = module.createNestApplication();
  try {
    await app.listen(0,'127.0.0.1');
    const port = (app.getHttpServer().address() as {port:number}).port;
    const origin = `http://127.0.0.1:${port}`;
    const product = 'b1a0fa70-a50a-4d84-8936-530496c8e4b0';
    const key = 'a7373837-b838-4804-babc-57369dffce3d';
    const form = () => { const body=new FormData(); body.append('file',new Blob(['synthetic'],{type:'image/png'}),'test.png'); body.append('alt','Prueba'); return body; };
    const send = () => fetch(`${origin}/admin/catalog/products/${product}/images`,{method:'POST',headers:{'If-Match':'0','Idempotency-Key':key},body:form()});
    assert.equal((await send()).status,403); assert.equal(intercepted,0); assert.equal(uploads,0);
    allowed=true;
    assert.equal((await send()).status,201); assert.equal(intercepted,1); assert.equal(uploads,1);
    const content=await fetch(`${origin}/catalog/images/${product}?w=320`);
    assert.equal(content.status,200); assert.equal(content.headers.get('content-type'),'image/webp');
    assert.equal(content.headers.get('x-content-type-options'),'nosniff'); assert.equal(content.headers.get('cache-control'),'no-store');
    assert.equal(Buffer.from(await content.arrayBuffer()).toString(),'RIFF-test-WEBP');
  } finally {
    await app.close();
    MediaUploadInterceptor.prototype.intercept = original;
  }
});
