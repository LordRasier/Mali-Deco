import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrandEditor } from '../../src/presentation/admin/client/browser/settings/brand-editor';

test('brand upload requires a valid file and owner session, sends one CSRF-protected request and reports success', async () => {
  const calls: Array<{ path: string; body: unknown; csrf: string | undefined }> = [], notices: string[] = [];
  const session = { getEpoch: () => 1, getSnapshot: () => ({ status: 'authenticated', csrf: 'csrf', user: { role: 'owner' } }) };
  const editor = createBrandEditor(session, { busy() {}, notice(_kind, text) { notices.push(text); }, saved() {} }, async (path, options) => {
    calls.push({ path, body: options?.body, csrf: options?.csrf }); return { saved: true } as never;
  });
  await editor.upload('logo', undefined); assert.equal(calls.length, 0);
  const file = new File(['sample'], 'logo.png', { type: 'image/png' });
  await editor.upload('logo', file); assert.equal(calls.length, 1); assert.equal(calls[0].path, '/admin/settings/branding/logo');
  assert.equal(calls[0].csrf, 'csrf'); assert.equal((calls[0].body as FormData).get('file'), file); assert.match(notices.at(-1)!, /guardad/i);
});

test('brand uploads are single-flight and do not replay uncertain results', async () => {
  const file = new File(['sample'], 'logo.png', { type: 'image/png' });
  let calls = 0, reject!: (reason: Error) => void; const notices: string[] = [];
  const session = { getEpoch: () => 1, getSnapshot: () => ({ status: 'authenticated', csrf: 'csrf', user: { role: 'owner' } }) };
  const editor = createBrandEditor(session, { busy() {}, notice(_kind, text) { notices.push(text); }, saved() { assert.fail('unconfirmed upload'); } },
    async () => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); });
  const first = editor.upload('logo', file); await editor.upload('icon', file); assert.equal(calls, 1);
  reject(new Error('Resultado incierto')); await first; assert.match(notices.at(-1)!, /incierto/); assert.equal(calls, 1);
});
