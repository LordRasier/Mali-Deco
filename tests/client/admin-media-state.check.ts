import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';
import type { SessionSnapshot } from '../../src/presentation/admin/client/session-core';
import { createAdminMedia, type MediaList } from '../../src/presentation/admin/client/browser/media/media-state';

const productId = '00000000-0000-4000-8000-000000000001', imageId = '00000000-0000-4000-8000-000000000002';
const list: MediaList = { revision: 1, items: [{ id: imageId, alt: 'Initial', width: 100, height: 100, position: 0, retired: false }] };
const file = () => new File(['synthetic image bytes'], 'synthetic.png', { type: 'image/png' });
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture(request: (path: string, options?: RequestOptions) => Promise<unknown> = async () => list, readOnly = false, initialFiles: File[] = [], initialAlts?: string[]) {
  let epoch = 1, next = 0;
  let auth: SessionSnapshot = { status: 'authenticated', user: { id: 'owner', email: 'owner@example.test', role: 'owner' }, csrf: 'csrf', error: null };
  const listeners = new Set<() => void>(), calls: { path: string; options?: RequestOptions }[] = [];
  const change = (patch: Partial<SessionSnapshot>, advance = false) => { if (advance) epoch++; auth = { ...auth, ...patch }; for (const fn of listeners) fn(); };
  const session = { getSnapshot: () => auth, getEpoch: () => epoch, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, expire: () => change({ status: 'anonymous', user: null, csrf: null }, true) };
  const store = createAdminMedia(session, productId, readOnly, { initialFiles, initialAlts, request: async (path, options) => { calls.push({ path, options }); return request(path, options); }, makeKey: () => `key-${++next}` });
  return { store, session, calls, change, async start() { store.start(); await settle(); } };
}

test('confirmed new-product photos wait for a trusted revision, survive a failed read, then upload once', async () => {
  let reads = 0, writes = 0;
  const f = fixture(async (_path, options) => {
    if (options?.method === 'POST') { writes++; return list; }
    if (++reads === 1) throw new ApiError(503, 'unavailable');
    return { revision: 0, items: [] };
  }, false, [file()]);
  await f.start();
  assert.equal(writes, 0); assert.equal(f.store.getSnapshot().queue.length, 1);
  await f.store.load(); await settle(); assert.equal(writes, 1);
  assert.equal(f.calls[2].options?.ifMatch, 0); assert.equal(f.store.getSnapshot().queue[0].status, 'success');
  await f.store.load(); await settle(); assert.equal(writes, 1); f.store.dispose();
});

test('a revoked session cannot upload the new-product selection after a delayed read', async () => {
  const first = deferred<unknown>(), f = fixture(() => first.promise, false, [file()]);
  f.store.start(); assert.equal(f.store.getSnapshot().queue.length, 1);
  f.session.expire(); first.resolve({revision: 0, items: []}); await settle();
  assert.equal(f.store.getSnapshot().queue.length, 0); assert.equal(f.calls.length, 1); f.store.dispose();
});

test('new-product image texts remain paired with each file across an uncertain upload retry', async () => {
  let writes = 0;
  const f = fixture(async (_path, options) => {
    if (!options?.method) return writes ? list : { revision: 0, items: [] };
    if (++writes === 2) throw new ApiError(503, 'unknown');
    return list;
  }, false, [file(), new File(['detail'], 'detail.png', { type: 'image/png' })], ['Texto de portada', 'Texto de detalle']);
  await f.start(); await settle();
  assert.equal(f.store.getSnapshot().needsReload, true);
  await f.store.load(); await f.store.retry(f.store.getSnapshot().queue[1].id);
  const uploads = f.calls.filter(call => call.options?.method === 'POST');
  assert.deepEqual(uploads.map(call => (call.options!.body as FormData).get('alt')), ['Texto de portada', 'Texto de detalle', 'Texto de detalle']);
  assert.equal(uploads[1].options!.idempotencyKey, uploads[2].options!.idempotencyKey);
  assert.equal((uploads[2].options!.body as FormData).get('file'), (uploads[1].options!.body as FormData).get('file'));
  f.store.dispose();
});

test('media snapshots are SSR-pure/stable; start reads once and archived/unauthorized stores cannot write', async () => {
  const f = fixture(); assert.equal(f.store.getSnapshot(), f.store.getServerSnapshot()); assert.equal(f.store.getSnapshot(), f.store.getSnapshot()); assert.equal(f.calls.length, 0);
  await f.start(); assert.equal(f.calls.length, 1); assert.equal(f.store.getServerSnapshot().data, null); assert.equal(f.store.getSnapshot().disabled, false); f.store.dispose();
  const archived = fixture(undefined, true); await archived.start(); archived.store.setFile(file()); await archived.store.upload(); assert.equal(archived.calls.length, 1); archived.store.dispose();
  const forbidden = fixture(); forbidden.change({ user: { id: 'ops', email: 'ops@example.test', role: 'operations' } }); await forbidden.start(); await forbidden.store.load(); assert.equal(forbidden.calls.length, 0); forbidden.store.dispose();
});

test('uncertain upload retains File/alt/key across explicit reload; retry uses fresh If-Match without automatic writes', async () => {
  let reads = 0, writes = 0;
  const f = fixture(async (_path, options) => {
    if (!options?.method) return { ...list, revision: ++reads };
    if (++writes === 1) throw new ApiError(0, 'Unknown result');
    return { ...list, revision: 3 };
  }); await f.start(); const selected = file(); f.store.setFile(selected); f.store.setAlt('Synthetic alt');
  await f.store.upload(); assert.equal(f.store.getSnapshot().needsReload, true); assert.equal(f.store.getSnapshot().file, selected);
  await f.store.upload(); assert.equal(writes, 1); await f.store.load(); assert.equal(writes, 1); assert.equal(f.store.getSnapshot().alt, 'Synthetic alt');
  await f.store.upload(); const sent = f.calls.filter(call => call.options?.method === 'POST');
  assert.equal(sent.length, 2); assert.equal(sent[0].options!.idempotencyKey, sent[1].options!.idempotencyKey);
  assert.equal(sent[0].options!.ifMatch, 1); assert.equal(sent[1].options!.ifMatch, 2);
  for (const call of sent) { assert.equal((call.options!.body as FormData).get('file'), selected); assert.equal((call.options!.body as FormData).get('alt'), 'Synthetic alt'); }
  assert.equal(f.store.getSnapshot().file, null); assert.equal(f.store.getSnapshot().alt, ''); f.store.dispose();
});

test('upload intent changes only when File/alt changes or success; reload and known rejection keep the key', async () => {
  const f = fixture(async (_path, options) => { if (options?.method) throw new ApiError(400, 'Rejected'); return list; }); await f.start();
  const selected = file(); f.store.setFile(selected); f.store.setAlt('A'); await f.store.upload(); f.store.setFile(selected); f.store.setAlt('A'); await f.store.load(); await f.store.upload();
  let sent = f.calls.filter(call => call.options?.method); assert.equal(sent[0].options!.idempotencyKey, sent[1].options!.idempotencyKey);
  f.store.setAlt('B'); await f.store.upload(); f.store.setFile(file()); await f.store.upload(); sent = f.calls.filter(call => call.options?.method);
  assert.notEqual(sent[1].options!.idempotencyKey, sent[2].options!.idempotencyKey); assert.notEqual(sent[2].options!.idempotencyKey, sent[3].options!.idempotencyKey); f.store.dispose();
});

test('412/428/network/5xx and malformed success require successful reload before every subsequent mutation', async () => {
  for (const failure of [new ApiError(412, 'Changed'), new ApiError(428, 'Missing'), new ApiError(503, 'Down'), new Error('Network'), null]) {
    const f = fixture(async (_path, options) => { if (!options?.method) return list; if (failure) throw failure; return { revision: -1, items: [] }; }); await f.start();
    f.store.setFile(file()); await f.store.upload(); assert.equal(f.store.getSnapshot().needsReload, true);
    const count = f.calls.length; await f.store.retire(imageId); await f.store.upload(); assert.equal(f.calls.length, count);
    await f.store.load(); assert.equal(f.store.getSnapshot().needsReload, false); f.store.dispose();
  }
});

test('upload validates MIME and 5 MiB, active count, and existing output/quota messages', async () => {
  const f = fixture(); await f.start(); f.store.setFile(new File(['x'], 'x.svg', { type: 'image/svg+xml' })); await f.store.upload();
  f.store.setFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })); await f.store.upload(); assert.equal(f.calls.length, 1); f.store.dispose();
  const full = fixture(async () => ({ revision: 1, items: Array.from({ length: 10 }, (_, i) => ({ ...list.items[0], id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, position: i })) }));
  await full.start(); full.store.setFile(file()); await full.store.upload(); assert.equal(full.calls.length, 1); full.store.dispose();
  const quota = fixture(async (_path, options) => { if (options?.method) throw new ApiError(409, 'Conflict', 'MEDIA_QUOTA_EXCEEDED'); return list; }); await quota.start(); quota.store.setFile(file()); await quota.store.upload(); assert.match(quota.store.getSnapshot().error, /cuota/); quota.store.dispose();
});

test('reorder/edit/retire/restore use current revision and membership gates', async () => {
  const second = { ...list.items[0], id: '00000000-0000-4000-8000-000000000003', position: 1 };
  const retired = { ...second, id: '00000000-0000-4000-8000-000000000004', retired: true, position: 2 };
  let revision = 1; const f = fixture(async (_path, options) => ({ revision: options?.method ? ++revision : revision, items: [list.items[0], second, retired] })); await f.start();
  await f.store.move(second.id, 0); assert.deepEqual(f.calls.at(-1)?.options?.body, { ids: [second.id, imageId] });
  f.store.edit(imageId); f.store.setEditAlt('Edited'); await f.store.saveAlt(); assert.equal(f.calls.at(-1)?.options?.ifMatch, 2);
  await f.store.retire(imageId); await f.store.restore(retired.id); assert.equal(f.calls.at(-1)?.options?.ifMatch, 4);
  const count = f.calls.length; await f.store.move('unknown', 0); await f.store.restore(imageId); assert.equal(f.calls.length, count); f.store.dispose();
});

test('stop/restart ignores old response, retains draft and imposes reload for in-flight write', async () => {
  const pending = deferred<unknown>(); const f = fixture(async (_path, options) => options?.method ? pending.promise : list); await f.start();
  const selected = file(); f.store.setFile(selected); const sending = f.store.upload(); f.store.stop(); f.store.start();
  pending.resolve({ ...list, revision: 9 }); await sending;
  assert.equal(f.store.getSnapshot().file, selected); assert.equal(f.store.getSnapshot().needsReload, true); assert.equal(f.store.getSnapshot().data?.revision, 1);
  const count = f.calls.length; await f.store.upload(); assert.equal(f.calls.length, count); f.store.dispose();
});

test('session epoch, identity and role transitions discard private state and ignore old effects', async () => {
  for (const kind of ['epoch', 'role', 'csrf']) {
    const pending = deferred<unknown>(); const f = fixture(async (_path, options) => options?.method ? pending.promise : list); await f.start(); f.store.setFile(file()); f.store.setAlt('Private draft');
    const sending = f.store.upload();
    if (kind === 'epoch') f.change({}, true); else if (kind === 'role') f.change({ user: { id: 'owner', email: 'owner@example.test', role: 'operations' } }); else f.change({ csrf: 'new-csrf' });
    pending.resolve({ ...list, revision: 8 }); await sending;
    assert.equal(f.store.getSnapshot().data, null); assert.equal(f.store.getSnapshot().file, null); assert.equal(f.store.getSnapshot().alt, ''); assert.equal(f.store.getSnapshot().disabled, true); f.store.dispose();
  }
});

test('archival during write ignores late response and preserves draft for read-only inspection', async () => {
  const pending = deferred<unknown>(); const f = fixture(async (_path, options) => options?.method ? pending.promise : list); await f.start(); const selected = file(); f.store.setFile(selected);
  const sending = f.store.upload(); f.store.setReadOnly(true); pending.resolve({ ...list, revision: 7 }); await sending;
  assert.equal(f.store.getSnapshot().file, selected); assert.equal(f.store.getSnapshot().disabled, true); assert.equal(f.store.getSnapshot().data?.revision, 1); f.store.dispose();
});

test('lifecycle cleanup still stops a store after read-only or authentication invalidation', async () => {
  for (const change of ['archived', 'auth']) {
    const f = fixture(), cleanup = f.store.start(); await settle();
    if (change === 'archived') f.store.setReadOnly(true); else f.change({}, true);
    cleanup(); assert.equal(f.store.getSnapshot().allowed, false);
    assert.doesNotThrow(() => { f.store.start(); f.store.stop(); }); f.store.dispose();
  }
});

test('batch sends one file per request in order, keeps mixed results, and retries only the chosen failed file', async () => {
  let revision = 3, reject = true;
  const f = fixture(async (_path, options) => {
    if (options && ((options.body as FormData).get('file') as File).name === 'b.png' && reject) throw new ApiError(400, 'Rejected');
    return { ...list, revision: options ? ++revision : revision };
  }); await f.start();
  const files = ['a', 'b', 'c'].map(name => new File([name], name + '.png', { type: 'image/png' }));
  f.store.setFiles(files); const running = f.store.upload(); await f.store.upload(); await running;
  const writes = () => f.calls.filter(call => call.options?.method).map(call => call.options!);
  assert.deepEqual(writes().map(request => (request.body as FormData).getAll('file')), files.map(file => [file]));
  assert.deepEqual(writes().map(request => request.ifMatch), [3, 4, 4]);
  assert.deepEqual(f.store.getSnapshot().queue.map(entry => entry.status), ['success', 'failed', 'success']);
  assert.equal(new Set(writes().map(request => request.idempotencyKey)).size, 3);
  await f.store.upload(); assert.equal(writes().length, 3);
  reject = false; await f.store.retry(f.store.getSnapshot().queue[1].id);
  assert.equal(writes().length, 4); assert.equal(writes()[3].idempotencyKey, writes()[1].idempotencyKey);
  assert.equal(writes()[3].ifMatch, 5);
  assert.deepEqual(f.store.getSnapshot().queue.map(entry => entry.status), ['success', 'success', 'success']); f.store.dispose();
});

test('unknown result pauses batch without losing pending entries; no auto replay on read or per-file retry', async () => {
  let n = 0; const f = fixture(async (_path, options) => {
    if (options?.method && ++n === 1) throw new ApiError(503, 'Unknown');
    return list;
  }); await f.start(); f.store.setFiles([file(), file()]); await f.store.upload();
  const first = f.store.getSnapshot().queue[0].id;
  assert.deepEqual(f.store.getSnapshot().queue.map(item => item.status), ['failed', 'pending']);
  await f.store.retry(first); assert.equal(n, 1); await f.store.load(); assert.equal(n, 1);
  await f.store.retry(first); assert.equal(n, 2);
  assert.deepEqual(f.store.getSnapshot().queue.map(item => item.status), ['success', 'pending']);
  await f.store.upload(); assert.equal(n, 3); f.store.dispose();
});

test('session revocation clears the whole queue and prevents late batch continuation', async () => {
  const pending = deferred<unknown>(), f = fixture(async (_path, options) => options ? pending.promise : list);
  await f.start(); f.store.setFiles([file(), file()]); const running = f.store.upload();
  f.change({}, true); pending.resolve(list); await running;
  assert.deepEqual(f.store.getSnapshot().queue, []); assert.equal(f.calls.filter(call => call.options?.method).length, 1); f.store.dispose();
});

test('interruption between decoding a write result and committing it locally still requires reload', async () => {
  let stop = () => {};
  const f = fixture(async (_path, options) => options ? {
    get revision() { queueMicrotask(stop); return 2; }, items: list.items,
  } : list);
  stop = () => f.store.stop();
  await f.start(); f.store.setFile(file()); await f.store.upload(); f.store.start();
  assert.equal(f.store.getSnapshot().needsReload, true); assert.equal(f.store.getSnapshot().data?.revision, 1);
  f.store.dispose();
});

test('a replay can reconcile the tenth accepted file without sending a fresh upload at capacity', async () => {
  const at = (n: number) => ({ revision: n, items: Array.from({ length: n }, (_, i) => ({
    ...list.items[0], id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), position: i,
  })) });
  let active = 9, writes = 0; const f = fixture(async (_path, opts) => {
    if (opts && ++writes === 1) { active++; throw new ApiError(0, 'Unknown'); }
    return at(active);
  }); await f.start(); f.store.setFiles([file(), file()]); await f.store.upload(); await f.store.load();
  await f.store.retry(f.store.getSnapshot().queue[0].id); await f.store.upload();
  assert.equal(writes, 2); assert.deepEqual(f.store.getSnapshot().queue.map(e => e.status), ['success', 'pending']); f.store.dispose();
});
