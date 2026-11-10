import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { StreamableFile } from '@nestjs/common';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { MediaService } from '../services/media-service';
import { MediaUploadInterceptor } from './media-upload.interceptor';
import { AdminMediaController, PublicMediaController } from './media.controller';

const product = '11111111-1111-4111-8111-111111111111';
const image = '22222222-2222-4222-8222-222222222222';
const bytes = Buffer.from('webp bytes');
const service = { readAdmin: async () => bytes, readPublic: async () => bytes, reorder: (_p: string, _r: number, body: unknown) => body } as unknown as MediaService;

test('admin guard protects upload before its interceptor runs', () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminMediaController), [CatalogGuard]);
  assert.deepEqual(Reflect.getMetadata(INTERCEPTORS_METADATA, AdminMediaController.prototype.upload), [MediaUploadInterceptor]);
});

test('content responses stream bytes with safe headers', async () => {
  for (const admin of [true, false]) {
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => { headers[name] = value; } };
    const result = admin ? await new AdminMediaController(service).content(product, image, '320', res) : await new PublicMediaController(service).content(image, '320', res);
    assert.ok(result instanceof StreamableFile);
    const chunks: Buffer[] = []; for await (const chunk of result.getStream()) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.deepEqual(headers, { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  }
});

test('mutation validates revision, upload fields and idempotency key', () => {
  const controller = new AdminMediaController(service);
  assert.throws(() => controller.reorder(product, undefined, { ids: [] }), { status: 428 });
  assert.throws(() => controller.reorder(product, '01', { ids: [] }), { status: 400 });
  assert.deepEqual(controller.reorder(product, '0', { ids: [] }), { ids: [] });
  assert.throws(() => controller.upload(product, '0', product, { buffer: bytes, size: bytes.length }, { alt: '', extra: '' }), { status: 400 });
  assert.throws(() => controller.upload(product, '0', 'bad', { buffer: bytes, size: bytes.length }, { alt: '' }), { status: 400 });
});
