import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSettingsEditor } from '../../src/presentation/admin/client/browser/settings/settings-editor';
import { mountSettings } from '../../src/presentation/admin/client/browser/settings/settings-browser';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';

function fixture() {
  let epoch = 1; const calls: unknown[] = []; const state = { primaryColor: '#073dcc', name: 'Original', whatsappNumber: '', instagramUsername: '', socialLinksEnabled: true, busy: false, message: '', reload: false, focused: '' };
  const view = { primaryColor: () => state.primaryColor, setPrimaryColor: (color: string) => { state.primaryColor = color; }, socialLinksEnabled: () => state.socialLinksEnabled,
    setSocialLinksEnabled: (enabled: boolean) => { state.socialLinksEnabled = enabled; }, focusField: (field: string) => { state.focused = field; },
    whatsappNumber: () => state.whatsappNumber, setWhatsAppNumber: (value: string) => { state.whatsappNumber = value; }, instagramUsername: () => state.instagramUsername, setInstagramUsername: (value: string) => { state.instagramUsername = value; },
    value: () => state.name, setValue: (name: string) => { state.name = name; }, busy: (busy: boolean) => { state.busy = busy; }, notice: (message: string) => { state.message = message; }, allowReload: (value: boolean) => { state.reload = value; } };
  const session = { getEpoch: () => epoch, getSnapshot: () => ({ status: 'authenticated' as const, csrf: 'synthetic-csrf', user: { role: 'owner' as const } }) };
  let response: Promise<unknown> = Promise.resolve({ name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: '' });
  const editor = createSettingsEditor(view, session, async (path, options) => { calls.push({ path, options }); return response; });
  return { state, view, calls, editor, setResponse: (next: Promise<unknown>) => { response = next; }, expire: () => { epoch++; } };
}

test('header brand selection validates, confirms exact persistence and restores the saved choice', async () => {
  const f = fixture(); f.state.name = 'Saved'; let mode = 'logo', enabled = true;
  Object.assign(f.view, { headerBrandMode: () => mode, setHeaderBrandMode: (value: string) => { mode = value; }, headerBrandEnabled: () => enabled, setHeaderBrandEnabled: (value: boolean) => { enabled = value; } });
  for (const choice of ['logo', 'logo_text', 'text']) {
    mode = choice;
    f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: '', headerBrandMode: choice }));
    await f.editor.save();
    assert.equal((f.calls.at(-1) as { options: { body: { headerBrandMode: string } } }).options.body.headerBrandMode, choice);
    assert.equal(mode, choice); assert.equal(enabled, true); assert.equal(f.state.reload, false);
  }
  mode = 'logo'; f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: '', headerBrandMode: 'text' }));
  await f.editor.save(); assert.equal(mode, 'logo'); assert.equal(f.state.reload, true);
  await f.editor.reload(); assert.equal(mode, 'text');
  mode = 'invalid'; const before = f.calls.length; await f.editor.save(); assert.equal(f.calls.length, before); assert.equal(f.state.focused, 'headerBrand');
  f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: '' }));
  await f.editor.reload(); assert.equal(enabled, false); assert.equal(f.state.reload, true);
  await f.editor.save(); assert.equal(Object.hasOwn((f.calls.at(-1) as { options: { body: object } }).options.body, 'headerBrandMode'), false);
});
test('settings validates before writes and keeps drafts while a single save is pending', async () => {
  const f = fixture(); f.state.name = '  '; await f.editor.save(); assert.equal(f.calls.length, 0);
  f.state.name = 'A\u0000B'; await f.editor.save(); assert.equal(f.calls.length, 0);
  f.state.name = ' Saved '; let finish!: (value: unknown) => void; f.setResponse(new Promise(resolve => { finish = resolve; }));
  const pending = f.editor.save(); await f.editor.save(); assert.equal(f.calls.length, 1); assert.equal(f.state.busy, true);
  assert.deepEqual(f.calls[0], { path: '/admin/settings', options: { method: 'PUT', body: { name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: '' }, csrf: 'synthetic-csrf' } });
  finish({ name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: '' }); await pending; assert.equal(f.state.name, 'Saved'); assert.equal(f.state.busy, false); assert.match(f.state.message, /guardad/);
});
test('uncertain response preserves draft and explicit reload is the only recovery read', async () => {
  const f = fixture(); f.state.name = 'Draft'; f.setResponse(Promise.resolve({ name: 'Different', primaryColor: '#073dcc' })); await f.editor.save();
  assert.equal(f.state.name, 'Draft'); assert.equal(f.state.reload, true); assert.equal(f.calls.length, 1);
  f.setResponse(Promise.resolve({ name: 'Persisted', primaryColor: '#073dcc' })); await f.editor.reload(); assert.equal(f.state.name, 'Persisted'); assert.equal(f.calls.length, 2);
});
test('disposal or changed identity suppresses late results and synchronous disposal prevents writes', async () => {
  const f = fixture(); let finish!: (value: unknown) => void; f.setResponse(new Promise(resolve => { finish = resolve; })); const pending = f.editor.save(); f.expire(); finish({ name: 'Original', primaryColor: '#073dcc' }); await pending; assert.equal(f.state.message, '');
  const g = fixture(); g.view.busy = busy => { g.state.busy = busy; if (busy) g.editor.dispose(); }; await g.editor.save(); assert.equal(g.calls.length, 0);
});

test('native settings binding disables its fieldset during save and preserves the draft after 503', async () => {
  class Control extends EventTarget {
    value = ''; disabled = false; hidden = false; textContent = ''; attributes = new Map<string, string>();
    dataset: Record<string, string> = {};
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  }
  const nodes = new Map(['form', 'color', 'name', 'whatsapp', 'instagram', 'header-brand', 'fields', 'message', 'reload'].map(name => [`[data-settings-${name}]`, new Control()]));
  nodes.get('[data-settings-header-brand]')!.dataset.initialValue = 'text';
  const input = nodes.get('[data-settings-name]')!, fields = nodes.get('[data-settings-fields]')!, form = nodes.get('[data-settings-form]')!;
  nodes.get('[data-settings-color]')!.value = '#123456'; input.value = 'Native draft'; fields.disabled = true;
  const root = { querySelector: (selector: string) => nodes.get(selector) ?? null, querySelectorAll: () => [] } as unknown as HTMLElement;
  const session = createSessionStore(async () => ({ user: { id: 'synthetic', email: 'synthetic@example.test', role: 'owner' }, csrf: 'synthetic' }) as never);
  await session.login('synthetic', 'synthetic');
  const original = globalThis.fetch; let finish!: (response: Response) => void, calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const dispose = mountSettings(root, session);
  try {
    assert.equal(fields.disabled, false);
    assert.equal(nodes.get('[data-settings-header-brand]')!.value, 'text');
    const event = new Event('submit', { cancelable: true }); form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true); assert.equal(fields.disabled, true); assert.equal(form.attributes.get('aria-busy'), 'true');
    form.dispatchEvent(new Event('submit', { cancelable: true })); assert.equal(calls, 1);
    finish(new Response('{}', { status: 503 })); await new Promise(resolve => setImmediate(resolve));
    assert.equal(fields.disabled, false); assert.equal(input.value, 'Native draft');
    assert.equal(nodes.get('[data-settings-header-brand]')!.value, 'text');
    assert.match(nodes.get('[data-settings-message]')!.textContent, /confirmar/); assert.equal(nodes.get('[data-settings-reload]')!.hidden, false);
    assert.equal(calls, 1); dispose(); assert.equal(fields.disabled, true);
    form.dispatchEvent(new Event('submit', { cancelable: true })); assert.equal(calls, 1);
  } finally { dispose(); globalThis.fetch = original; }
});


test('settings color is validated, confirmed and kept with the draft on failure', async () => {
  const f = fixture(); f.state.primaryColor = 'red'; await f.editor.save(); assert.equal(f.calls.length, 0);
  f.state.name = 'Saved'; f.state.primaryColor = '#aa2211';
  f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#073dcc' })); await f.editor.save();
  assert.equal(f.state.primaryColor, '#aa2211'); assert.equal(f.state.reload, true);
  f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#aa2211', whatsappNumber: '', instagramUsername: '' })); await f.editor.save();
  assert.equal(f.state.primaryColor, '#aa2211'); assert.equal(f.state.reload, false);
});

test('social drafts normalize safely and are only replaced after exact save confirmation', async () => {
  const f = fixture(); f.state.name = 'Saved'; f.state.whatsappNumber = '+54 (9) 223-555-0123'; f.state.instagramUsername = 'https://www.instagram.com/Mali_Example/?igsh=test';
  f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#073dcc', whatsappNumber: '5492235550123', instagramUsername: 'mali_example' }));
  await f.editor.save();
  assert.equal(f.state.whatsappNumber, '5492235550123'); assert.equal(f.state.instagramUsername, 'mali_example');
  f.state.instagramUsername = '@new_example';
  await f.editor.save(); assert.equal(f.state.instagramUsername, '@new_example'); assert.equal(f.state.reload, true);
  const before = f.calls.length; f.state.whatsappNumber = 'javascript:alert(1)'; await f.editor.save(); assert.equal(f.calls.length, before);
  f.state.whatsappNumber = ''; f.state.instagramUsername = 'https://evil.test/mali'; await f.editor.save(); assert.equal(f.calls.length, before);
});

test('a pending social migration does not prevent existing appearance saves', async () => {
  const f = fixture(); f.state.name = 'Saved'; f.state.socialLinksEnabled = false;
  f.setResponse(Promise.resolve({ name: 'Saved', primaryColor: '#073dcc' })); await f.editor.save();
  assert.deepEqual(f.calls[0], { path: '/admin/settings', options: { method: 'PUT', body: { name: 'Saved', primaryColor: '#073dcc' }, csrf: 'synthetic-csrf' } });
  assert.equal(f.state.reload, true); assert.match(f.state.message, /guardad/);
});

test('explicit reload enables social fields as soon as their migration is available', async () => {
  const f = fixture(); f.state.socialLinksEnabled = false;
  f.setResponse(Promise.resolve({ name: 'Original', primaryColor: '#073dcc', whatsappNumber: null, instagramUsername: null }));
  await f.editor.reload();
  assert.equal(f.state.socialLinksEnabled, true); assert.equal(f.state.reload, false);
  f.state.whatsappNumber = '+54 9 223 5550123'; f.state.instagramUsername = '@mali_example';
  f.setResponse(Promise.resolve({ name: 'Original', primaryColor: '#073dcc', whatsappNumber: '5492235550123', instagramUsername: 'mali_example' }));
  await f.editor.save();
  assert.equal(f.state.whatsappNumber, '5492235550123'); assert.equal(f.calls.length, 2);
});

test('validation identifies the field so hidden tabs can reveal the error without writing', async () => {
  const f = fixture(); f.state.name = ''; await f.editor.save(); assert.equal(f.state.focused, 'name');
  f.state.name = 'Mali'; f.state.whatsappNumber = 'invalid'; await f.editor.save(); assert.equal(f.state.focused, 'whatsapp');
  f.state.whatsappNumber = ''; f.state.instagramUsername = 'https://other.test/profile'; await f.editor.save(); assert.equal(f.state.focused, 'instagram');
  assert.equal(f.calls.length, 0);
});
