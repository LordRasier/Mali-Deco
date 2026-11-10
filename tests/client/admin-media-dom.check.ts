import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';
import { createAdminMedia } from '../../src/presentation/admin/client/browser/media/media-state';
import { mountAdminMedia } from '../../src/presentation/admin/client/browser/media/media-browser';

class NodeDouble extends EventTarget {
  value = ''; textContent = ''; hidden = false; disabled = false; className = ''; type = ''; maxLength = 0; files: File[] = []; focused = 0;
  children: NodeDouble[] = []; parent: NodeDouble | null = null; attributes = new Map<string, string>();
  ownerDocument = { createElement: () => new NodeDouble(), createElementNS: () => new NodeDouble() };
  get parentElement() { return this.parent; }
  set innerHTML(_value: string) { throw Error('HTML injection forbidden'); }
  append(...nodes: NodeDouble[]) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node); } }
  insertBefore(node: NodeDouble, before: NodeDouble | null) { node.remove(); node.parent = this; const index = before ? this.children.indexOf(before) : -1; if (index < 0) this.children.push(node); else this.children.splice(index, 0, node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(value => value !== this); this.parent = null; }
  replaceChildren(...nodes: NodeDouble[]) { for (const node of [...this.children]) node.remove(); this.append(...nodes); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() { this.focused++; }
  closest() { return this.hidden ? this : null; }
  reportValidity() { return true; }
}
function dom() {
  const nodes = new Map<string, NodeDouble>();
  for (const name of ['heading', 'loading', 'error', 'message', 'reload', 'content', 'upload', 'file', 'alt', 'submit', 'limit', 'empty', 'active', 'retired-box', 'retired', 'upload-help', 'storage-help', 'queue', 'queue-summary', 'alt-label', 'discard', 'add', 'editor']) nodes.set(`[data-media-${name}]`, new NodeDouble());
  const root = Object.assign(new NodeDouble(), { querySelector: (selector: string) => nodes.get(selector) ?? null });
  return { root: root as unknown as HTMLElement, get: (name: string) => nodes.get(`[data-media-${name}]`)! };
}
const productId = '00000000-0000-4000-8000-000000000001', imageId = '00000000-0000-4000-8000-000000000002';
const image = { id: imageId, alt: '<img src=x>', width: 100, height: 100, position: 0, retired: false };
const settle = async () => { for (let i = 0; i < 18; i++) await Promise.resolve(); };
function fixture(request: (path: string, options?: RequestOptions) => Promise<unknown>) {
  const session = { getSnapshot: () => ({ status: 'authenticated' as const, user: { id: 'owner', email: 'owner@example.test', role: 'owner' as const }, csrf: 'csrf', error: null }), getEpoch: () => 1, subscribe: () => () => {}, expire() {} };
  const store = createAdminMedia(session, productId, false, { request, makeKey: () => 'same-key' }), d = dom();
  const mounted = mountAdminMedia(d.root, session, productId, false, { store });
  return { store, d, mounted };
}
function action(root: NodeDouble, name: string): NodeDouble {
  if (root.attributes.get('data-media-action') === name) return root;
  for (const child of root.children) { try { return action(child, name); } catch { /* Search the remaining children. */ } }
  throw Error('Missing action ' + name);
}

test('media widget retains native File and drafts through hide/reload and uncertain retry', async () => {
  const sent: RequestOptions[] = []; let writes = 0, revision = 1;
  const f = fixture(async (_path, options) => { if (options?.method) { sent.push(options); if (++writes === 1) throw new ApiError(503, 'Unknown'); revision++; } return { revision, items: [image] }; }); await settle();
  const fileInput = f.d.get('file'), selected = new File(['synthetic'], 'image.png', { type: 'image/png' }); fileInput.files = [selected]; fileInput.value = 'C:\\fakepath\\image.png';
  fileInput.dispatchEvent(new Event('change')); f.d.get('alt').value = 'Synthetic alt'; f.d.get('alt').dispatchEvent(new Event('input'));
  f.d.root.hidden = true; await f.store.load(); f.d.root.hidden = false;
  assert.equal(f.d.get('file'), fileInput); assert.equal(fileInput.value, 'C:\\fakepath\\image.png'); assert.equal(f.store.getSnapshot().file, selected);
  const submit = new Event('submit', { cancelable: true }); f.d.get('upload').dispatchEvent(submit); await settle(); assert.equal(submit.defaultPrevented, true);
  assert.equal(f.d.get('submit').disabled, true); assert.equal(f.d.get('reload').hidden, false); assert.equal(fileInput.value, 'C:\\fakepath\\image.png');
  f.d.get('reload').dispatchEvent(new Event('click')); await settle(); f.d.get('upload').dispatchEvent(new Event('submit', { cancelable: true })); await settle();
  assert.equal(sent.length, 2); assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey); assert.equal((sent[1].body as FormData).get('file'), selected);
  assert.equal(fileInput.value, ''); assert.equal(f.d.get('alt').value, ''); f.mounted.dispose();
});

test('media rows render untrusted alt as text, retain editor draft and restore cancel focus', async () => {
  const f = fixture(async () => ({ revision: 1, items: [image] })); await settle();
  const row = f.d.get('active').children[0]; assert.ok(row); const edit = action(row, 'edit'); edit.dispatchEvent(new Event('click'));
  const editor = action(f.d.get('editor'), 'edit-alt'); editor.value = 'Draft'; editor.dispatchEvent(new Event('input')); await f.store.load();
  assert.equal(f.d.get('active').children[0], row); assert.equal(editor.value, 'Draft');
  assert.equal(editor.parent?.parent?.parent, f.d.get('editor'));
  action(f.d.get('editor'), 'cancel').dispatchEvent(new Event('click')); assert.equal(edit.focused, 1);
  f.mounted.setReadOnly(true); assert.equal(f.d.get('upload').hidden, true); assert.equal(edit.disabled, true); f.mounted.dispose();
});

test('hiding media does not steal focus and disposal removes handlers and clears selected file', async () => {
  let writes = 0; const f = fixture(async (_path, options) => { if (options?.method) writes++; return { revision: 1, items: [image] }; }); await settle();
  f.d.root.hidden = true; f.store.edit(imageId); f.store.cancelEdit(); assert.equal(f.d.get('heading').focused, 0);
  const input = f.d.get('file'); input.files = [new File(['x'], 'x.png', { type: 'image/png' })]; input.value = 'C:\\fakepath\\x.png'; input.dispatchEvent(new Event('change'));
  f.mounted.dispose(); assert.equal(input.value, ''); f.d.get('upload').dispatchEvent(new Event('submit', { cancelable: true })); await settle(); assert.equal(writes, 0);
});

test('cover action publishes confirmed cover URL and count; draft edits do not emit', async () => {
  const second = { ...image, id: '00000000-0000-4000-8000-000000000003', position: 1 };
  const f = fixture(async (_path, opts) => opts ? { revision: 2, items: [{ ...second, position: 0 }, { ...image, position: 1 }] } : { revision: 1, items: [image, second] });
  const events: CustomEvent[] = [];
  f.d.root.addEventListener('product-media-updated', ev => events.push(ev as CustomEvent)); await settle();
  const cover = action(f.d.get('active').children[1], 'primary'); assert.equal(cover.textContent, 'Usar como portada');
  f.store.setAlt('draft'); assert.equal(events.length, 1);
  cover.dispatchEvent(new Event('click')); await settle();
  assert.equal(events.length, 2); assert.equal(events[1].bubbles, true); assert.deepEqual(events[1].detail, { count: 2, coverUrl: '/api/v1' + f.store.path + '/' + second.id + '/content?w=320' });
  f.mounted.dispose();
});

test('native multi-selection shows per-file outcomes and a retry without resending accepted siblings', async () => {
  const sent: string[] = []; let reject = true;
  const f = fixture(async (_path, opts) => {
    if (opts) {
      const name = ((opts.body as FormData).get('file') as File).name; sent.push(name);
      if (name === 'second.png' && reject) throw new ApiError(400, 'rejected');
    }
    return { revision: 1 + sent.length, items: [] };
  }); await settle();
  const input = f.d.get('file'); input.files = ['first', 'second'].map(name => new File([name], name + '.png', { type: 'image/png' }));
  input.dispatchEvent(new Event('change')); f.d.get('upload').dispatchEvent(new Event('submit', { cancelable: true })); await settle();
  assert.deepEqual(sent, ['first.png', 'second.png']);
  const queue = f.d.get('queue'); assert.deepEqual(queue.children.map(row => row.attributes.get('data-upload-status')), ['success', 'failed']);
  reject = false; action(queue.children[1], 'retry').dispatchEvent(new Event('click')); await settle();
  assert.deepEqual(sent, ['first.png', 'second.png', 'second.png']); assert.equal(f.d.get('submit').disabled, true);
  f.mounted.dispose(); assert.equal(queue.children.length, 0);
});

test('media activity distinguishes metadata reads, drafts, ongoing writes, uncertain retries and completion', async () => {
  let reject!: (error: unknown) => void, writes = 0;
  const f = fixture(async (_path, opts) => {
    if (opts?.method && ++writes === 1) return new Promise((_yes, no) => { reject = no; });
    return { revision: 1, items: [image] };
  });
  assert.equal(f.mounted.activity(), 'clear'); await settle();
  f.store.edit(imageId); assert.equal(f.mounted.activity(), 'clear');
  f.store.setEditAlt('new alt'); assert.equal(f.mounted.activity(), 'pending'); f.store.cancelEdit();
  f.store.setFile(new File(['x'], 'image.png', { type: 'image/png' })); assert.equal(f.mounted.activity(), 'pending');
  const uploading = f.store.upload(); assert.equal(f.mounted.activity(), 'writing'); reject(new ApiError(503, 'unknown')); await uploading;
  assert.equal(f.mounted.activity(), 'pending'); await f.store.load(); assert.equal(f.mounted.activity(), 'pending');
  await f.store.upload(); assert.equal(f.mounted.activity(), 'clear'); f.mounted.dispose(); assert.equal(f.mounted.activity(), 'clear');
});

test('discard clears a rejected selection and its alt without changing confirmed images or calling the API', async () => {
  let calls = 0;
  const f = fixture(async (_path, opts) => { calls++; if (opts) throw new ApiError(400, 'invalid'); return { revision: 1, items: [image] }; });
  await settle(); f.store.setFile(new File(['x'], 'test.png', { type: 'image/png' })); f.store.setAlt('private draft'); await f.store.upload();
  const discard = f.d.get('discard'); assert.equal(discard.hidden, false);
  discard.dispatchEvent(new Event('click')); await settle();
  assert.equal(f.mounted.activity(), 'clear'); assert.equal(f.d.get('alt').value, ''); assert.equal(discard.hidden, true);
  assert.deepEqual(f.store.getSnapshot().active.map(item => item.id), [imageId]); assert.equal(calls, 2); f.mounted.dispose();
});

test('discard cannot interrupt a write; after unknown result it requires explicit confirmation and a manual list check', async () => {
  let calls = 0, prompts = 0, confirm = false, reject!: (error: unknown) => void;
  const f = fixture(async (_path, opts) => { calls++; return opts ? new Promise((_yes, no) => { reject = no; }) : { revision: 1, items: [image] }; });
  Object.assign(f.d.root.ownerDocument, { defaultView: { confirm(message: string) { prompts++; assert.match(message, /recarg/i); return confirm; } } });
  await settle(); f.store.setFile(new File(['x'], 'test.png', { type: 'image/png' })); const write = f.store.upload();
  const discard = f.d.get('discard'); assert.equal(discard.disabled, true); discard.dispatchEvent(new Event('click')); assert.equal(f.mounted.activity(), 'writing');
  reject(new ApiError(503, 'unknown')); await write; discard.dispatchEvent(new Event('click'));
  assert.equal(prompts, 1); assert.equal(f.mounted.activity(), 'pending'); confirm = true; discard.dispatchEvent(new Event('click'));
  assert.equal(prompts, 2); assert.equal(f.mounted.activity(), 'clear'); assert.equal(calls, 2); assert.equal(f.d.get('reload').hidden, false);
  f.mounted.dispose();
});
