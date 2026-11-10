import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../../src/presentation/admin/client/api.ts';
/* global Response, FormData, Blob */
import { createUploadIntent } from '../../src/presentation/admin/client/upload-intent.ts';

test('lost upload response keeps the key across reload and explicit retry; edits start a new intent', async () => {
  let next = 0; const intent = createUploadIntent(() => `key-${++next}`);
  const original = globalThis.fetch; const calls = []; let committed = false;
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    if (options.method === 'GET') return new Response('{"revision":2,"items":[]}', { status: 200 });
    if (!committed) { committed = true; throw new Error('response lost'); }
    return new Response('{"revision":2,"items":[]}', { status: 200 });
  };
  try {
    const send = () => apiRequest('/admin/catalog/products/1/images', { method: 'POST', body: new FormData(), csrf: 'csrf', ifMatch: 1, idempotencyKey: intent.key() });
    await assert.rejects(send()); assert.equal(calls.length, 1);
    await apiRequest('/admin/catalog/products/1/images'); assert.equal(calls.length, 2);
    await send(); assert.equal(calls[0][1].headers['Idempotency-Key'], calls[2][1].headers['Idempotency-Key']);
    intent.reset(); assert.notEqual(intent.key(), calls[0][1].headers['Idempotency-Key']); // file changed
    const afterFileChange = intent.key(); intent.reset(); assert.notEqual(intent.key(), afterFileChange); // alt changed
    const beforeSuccess = intent.key(); intent.reset(); assert.notEqual(intent.key(), beforeSuccess);
  } finally { globalThis.fetch = original; }
});

test('image upload sends multipart, concurrency and idempotency headers without retry', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return new Response('{"revision":2,"items":[]}', { status: 200 }); };
  try {
    const body = new FormData(); body.append('file', new Blob(['image'], { type: 'image/png' }), 'x.png'); body.append('alt', 'Mesa');
    assert.equal((await apiRequest('/admin/catalog/products/1/images', { method: 'POST', body, csrf: 'csrf', ifMatch: 1, idempotencyKey: 'uuid' })).revision, 2);
    assert.equal(calls.length, 1); assert.equal(calls[0][1].headers['If-Match'], '1'); assert.equal(calls[0][1].headers['Idempotency-Key'], 'uuid');
    assert.equal(calls[0][1].headers['Content-Type'], undefined); assert.equal(calls[0][1].body, body);
  } finally { globalThis.fetch = original; }
});
import { createEditFocus, imageUploadHelp, imageUploadRejected } from '../../src/presentation/admin/client/image-ui.ts';

test('cancel returns focus to the matching edit button after it mounts', () => {
  const focus = createEditFocus(); let focused = 0;
  focus.restore('image-1'); focus.attach('image-2', { focus: () => focused++ }); assert.equal(focused, 0);
  focus.attach('image-1', { focus: () => focused++ }); assert.equal(focused, 1);
  focus.attach('image-1', { focus: () => focused++ }); assert.equal(focused, 1);
});

test('upload help and rejection explain constraints without claiming the cause', () => {
  for (const term of ['5 MiB', '16 megapíxeles', '8000', 'animaciones']) assert.ok(imageUploadHelp.includes(term));
  assert.match(imageUploadRejected, /revisá/i); assert.match(imageUploadRejected, /no se pudo determinar/i);
});

test('cancel falls back to the heading when edit is disabled', () => {
  const focus = createEditFocus(); const targets = [];
  focus.restore('image-1');
  focus.attach('image-1', { disabled: true, focus: () => targets.push('edit') }, { focus: () => targets.push('heading') });
  assert.deepEqual(targets, ['heading']);
});
import { mediaErrorMessage, mediaStorageHelp } from '../../src/presentation/admin/client/image-ui.ts';

test('storage limits and specific known server errors are communicated without guessing', () => {
  assert.match(mediaStorageHelp, /retiradas/); assert.match(mediaStorageHelp, /384 KiB/); assert.match(mediaStorageHelp, /1 MiB/);
  assert.match(mediaErrorMessage(413, 'OUTPUT_TOO_LARGE') ?? '', /reduc/i);
  assert.match(mediaErrorMessage(409, 'MEDIA_QUOTA_EXCEEDED') ?? '', /cuota/i);
  assert.match(mediaErrorMessage(503, 'MEDIA_PACKET_TOO_SMALL') ?? '', /administrador/i);
  assert.equal(mediaErrorMessage(409, 'OUTPUT_TOO_LARGE'), undefined);
  assert.equal(mediaErrorMessage(409, 'UNKNOWN'), undefined);
});

