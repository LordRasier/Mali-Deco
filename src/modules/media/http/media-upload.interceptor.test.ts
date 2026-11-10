import 'reflect-metadata';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { claimMediaUpload, MediaUploadInterceptor } from './media-upload.interceptor';

function setup(stream: Observable<unknown>) {
  const request = Object.assign(new EventEmitter(), { file: {} }); const response = new EventEmitter();
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext;
  const interceptor = new MediaUploadInterceptor();
  (interceptor as unknown as { multipart: unknown }).multipart = { intercept: async () => stream };
  return { interceptor, context, request, response };
}
const next = { handle: () => of('ok') } as CallHandler;

test('admits one upload globally and releases on completion or parsing error', async () => {
  const pending = new Subject<unknown>(); const a = setup(pending); const b = setup(of('ok'));
  const sub = a.interceptor.intercept(a.context, next).subscribe();
  await assert.rejects(firstValueFrom(b.interceptor.intercept(b.context, next)), { status: 429 });
  sub.unsubscribe();
  assert.equal(await firstValueFrom(b.interceptor.intercept(b.context, next)), 'ok');
  const bad = setup(of('ok'));
  (bad.interceptor as unknown as { multipart: unknown }).multipart = { intercept: async () => { throw new Error('bad multipart'); } };
  await assert.rejects(firstValueFrom(bad.interceptor.intercept(bad.context, next)), /bad multipart/);
  assert.equal(await firstValueFrom(b.interceptor.intercept(b.context, next)), 'ok');
});

test('claimed slot survives disconnect until processing finishes', async () => {
  const pending = new Subject<unknown>(); const a = setup(pending); const b = setup(of('ok'));
  a.interceptor.intercept(a.context, next).subscribe();
  await Promise.resolve(); await Promise.resolve();
  const release = claimMediaUpload(a.request.file);
  a.response.emit('close');
  await assert.rejects(firstValueFrom(b.interceptor.intercept(b.context, next)), { status: 429 });
  release(); release();
  assert.equal(await firstValueFrom(b.interceptor.intercept(b.context, next)), 'ok');
});

test('disconnect before claim releases the slot', async () => {
  const a = setup(new Subject()); const b = setup(of('ok'));
  a.interceptor.intercept(a.context, next).subscribe();
  a.request.emit('aborted');
  assert.equal(await firstValueFrom(b.interceptor.intercept(b.context, next)), 'ok');
});

test('invalid file values do not throw while claiming', () => { for (const value of [undefined, null, 'invalid', 1]) assert.doesNotThrow(() => claimMediaUpload(value)()); });
