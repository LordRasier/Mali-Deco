import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountContentEditor } from '../../src/presentation/admin/client/browser/content/content-editor';
import { ContentHistory, contentAt } from '../../src/presentation/admin/client/browser/content/content-state';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { defaultContentConfig } from '../../src/modules/settings/content-config';
import { normalizeSections } from '../../src/modules/settings/content-validation';

class Node extends EventTarget {
  children: Node[] = []; parent?: Node; dataset: Record<string, string> = {}; attributes = new Map<string, string>();
  disabled = false; value = ''; checked = false; open = false; hidden = false; textContent = ''; type = ''; className = ''; srcdoc = '';
  classList = { add: () => {}, toggle: () => {} }; contentDocument: Node | null = null; contentWindow = null;
  constructor(readonly tagName = 'DIV') { super(); }
  get options() { return this.children; }
  get parentElement() { return this.parent; }
  append(...nodes: Node[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  prepend(...nodes: Node[]) { for (const node of nodes) node.parent = this; this.children.unshift(...nodes); }
  replaceChildren(...nodes: Node[]) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  focus() {}
  scrollIntoView() {}
  matches(selector: string): boolean {
    return selector.split(',').some(s => {
      if (s.trim() === '*') return true;
      if (/^[a-z]+$/.test(s.trim())) return this.tagName === s.trim().toUpperCase();
      const key = s.trim().match(/^\[data-(.*?)\]$/)?.[1]?.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return !!key && Object.hasOwn(this.dataset, key);
    });
  }
  closest(selector: string): Node | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector: string): Node[] { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
}

test('visual editor saves drafts separately, publishes deliberately and preserves local changes on conflicts', async () => {
  const original = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  const form = new Node('FORM'), fields = new Node('FIELDSET'), editor = new Node(), message = new Node(), reload = new Node('BUTTON');
  const nodes: Record<string, Node> = { fields, editor, message, reload, outline: new Node(), pages: new Node(), state: new Node(), scope: new Node('SELECT'), preview: new Node(), 'preview-status': new Node(), selection: new Node(), viewport: new Node('SELECT') };
  for (const [key, node] of Object.entries(nodes)) node.dataset['content' + key.replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase())] = '';
  const buttons = Object.fromEntries(['draft', 'publish', 'restore', 'undo', 'redo'].map(key => { const button = new Node('BUTTON'); button.dataset.contentCommand = key; return [key, button]; }));
  form.append(fields, message, reload); fields.append(editor, ...Object.entries(nodes).filter(([key]) => !['fields', 'editor', 'message', 'reload'].includes(key)).map(([, node]) => node), ...Object.values(buttons));
  const root = { querySelector: () => form } as unknown as HTMLElement;
  let confirmReload = false, writes = 0, reads = 0, conflict = false;
  const previewTargets: string[] = [];
  let published = normalizeSections(defaultContentConfig());
  let stored = { settings: structuredClone(published), revision: 0, publishedRevision: 0, available: true, hasDraft: false, stale: false };
  const session = createSessionStore(async () => ({ user: { id: 'qa', email: 'qa@example.test', role: 'owner' }, csrf: 'qa-csrf' }) as never);
  await session.login('qa', 'qa');
  globalThis.document = { createElement: (name: string) => new Node(name.toUpperCase()), activeElement: null } as unknown as Document;
  globalThis.window = Object.assign(new EventTarget(), { confirm: () => confirmReload }) as unknown as Window & typeof globalThis;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith('/preview')) { previewTargets.push(JSON.parse(String(options?.body)).target); return new Response(JSON.stringify({ html: '<!doctype html><p>Preview</p>' })); }
    if (options?.method !== 'GET') {
      writes++; assert.equal(new Headers(options?.headers).get('x-csrf-token'), 'qa-csrf');
      if (conflict) return new Response('{}', { status: 409 });
      const body = JSON.parse(String(options?.body)); assert.equal(body.revision, stored.revision); assert.equal(body.publishedRevision, stored.publishedRevision);
      const publish = path.endsWith('/publish');
      stored = { ...stored, settings: body.settings, revision: stored.revision + 1, publishedRevision: stored.publishedRevision + Number(publish), hasDraft: !publish };
      if (publish) published = structuredClone(body.settings);
    } else reads++;
    return new Response(JSON.stringify(stored));
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const dispatch = (host: Node, target: Node, name: string) => { const event = new Event(name, { cancelable: true }); Object.defineProperty(event, 'target', { value: target }); host.dispatchEvent(event); return event; };
  const select = (path: string) => { const node = new Node('BUTTON'); node.dataset.contentSelect = path; dispatch(form, node, 'click'); };
  const control = (path: string) => editor.querySelectorAll('[data-content-path]').find(n => n.dataset.contentPath === path)!;
  const change = (path: string, value: string | boolean) => { const node = control(path); assert.ok(node, path); if (typeof value === 'boolean') node.checked = value; else node.value = value; dispatch(editor, node, 'change'); };
  const dispose = mountContentEditor(root, session);
  try {
    await settle(); assert.equal(reads, 1); assert.equal(fields.disabled, false);
    assert.equal(nodes.pages.children.length, 3, 'Page groups separate shop, information and legal topics');
    assert.equal(nodes.pages.querySelectorAll('[data-content-page]').length, 12);
    const branches = () => nodes.outline.querySelectorAll('[data-content-branch]');
    assert.equal(branches().find(n => n.dataset.contentBranch === 'footer')?.open, false);
    assert.equal(branches().find(n => n.dataset.contentBranch === 'page')?.open, true);
    select('footer.benefits.0'); assert.equal(branches().find(n => n.dataset.contentBranch === 'footer')?.open, true);
    assert.equal(branches().find(n => n.dataset.contentBranch === 'footer.benefits')?.open, true);
    assert.equal(branches().find(n => n.dataset.contentBranch === 'footer.columns')?.open, false, 'Unrelated branches stay collapsed');
    const legalPage = nodes.pages.querySelectorAll('[data-content-page]').find(n => n.dataset.contentPage === 'politica-de-privacidad')!;
    dispatch(form, legalPage, 'click'); assert.equal(nodes.scope.value, 'politica-de-privacidad');
    select('blocks.information.legal'); assert.ok(control('contact.legalName')); assert.ok(control('copy.information.legalTitle'));
    select('copy.catalog'); select('listing'); change('listing.columns', '2');
    assert.equal(control('listing.columns').value, '2'); dispatch(form, buttons.undo, 'click'); assert.equal(control('listing.columns').value, '3');
    const homePage = nodes.pages.querySelectorAll('[data-content-page]').find(n => n.dataset.contentPage === 'home')!; dispatch(form, homePage, 'click');
    assert.equal(nodes.preview.children[0].attributes.get('sandbox'), 'allow-same-origin');
    // Real event delegation selects the innermost field rather than its surrounding block.
    const frame = nodes.preview.children[0], previewDocument = new Node('DOCUMENT');
    const hero = new Node('SECTION'), heading = new Node('H1'), accent = new Node('SPAN'), action = new Node('A');
    hero.dataset.editorPath = 'blocks.home.hero'; heading.dataset.editorPath = 'copy.home.title'; accent.dataset.editorPath = 'copy.home.titleAccent'; action.dataset.editorPath = 'copy.home.action';
    hero.append(heading, action); heading.append(accent); previewDocument.append(hero); frame.contentDocument = previewDocument; frame.dispatchEvent(new Event('load'));
    assert.equal(dispatch(previewDocument, accent, 'click').defaultPrevented, true);
    assert.ok(control('copy.home.titleAccent')); assert.equal(control('copy.home.title'), undefined);
    change('copy.home.titleAccent', 'Tu próxima partida.');
    assert.equal(control('copy.home.titleAccent').value, 'Tu próxima partida.');
    dispatch(form, buttons.undo, 'click'); assert.equal(control('copy.home.titleAccent').value, published.copy.home.titleAccent);
    assert.equal(dispatch(previewDocument, action, 'click').defaultPrevented, true, 'Preview links edit instead of navigating');
    assert.ok(control('copy.home.action')); assert.equal(nodes.scope.value, 'home');
    const parent = editor.querySelectorAll('[data-content-select]').find(node => node.dataset.contentSelect === 'blocks.home.hero')!;
    dispatch(form, parent, 'click'); assert.ok(control('copy.home.title')); assert.ok(control('copy.home.description'));
    select('pages.cuidados'); change('pages.cuidados.enabled', false);
    form.dispatchEvent(new Event('submit', { cancelable: true })); form.dispatchEvent(new Event('submit', { cancelable: true })); await settle();
    assert.equal(writes, 1); assert.equal(stored.settings.pages.cuidados.enabled, false); assert.equal(published.pages.cuidados.enabled, true);
    assert.match(message.textContent, /Borrador guardado/);
    dispatch(form, buttons.publish, 'click'); await settle(); assert.equal(published.pages.cuidados.enabled, false); assert.match(message.textContent, /publicado/);
    select('footer'); change('footer.description', 'Borrador protegido'); conflict = true;
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(previewTargets.at(-1), 'cuidados', 'Editing the shared footer keeps the complete selected page');
    form.dispatchEvent(new Event('submit', { cancelable: true })); await settle();
    assert.equal(control('footer.description').value, 'Borrador protegido'); assert.match(message.textContent, /otra pestaña/);
    const before = writes; form.dispatchEvent(new Event('submit')); await settle(); assert.equal(writes, before);
    reload.dispatchEvent(new Event('click')); await settle(); assert.equal(reads, 1);
    confirmReload = true; reload.dispatchEvent(new Event('click')); await settle(); assert.equal(reads, 2);
    assert.equal(control('footer.description').value, published.footer.description);
    dispose(); form.dispatchEvent(new Event('submit')); await settle(); assert.equal(writes, before); assert.equal(fields.disabled, true);
  } finally { dispose(); Object.assign(globalThis, original); }
});

test('block history reorders, duplicates with unique IDs, undoes removals and rejects unknown object paths', () => {
  const history = new ContentHistory(), config = normalizeSections(defaultContentConfig()); history.load(config);
  const first = config.footer.columns[0].title;
  history.move('footer.columns', 0, 2); assert.equal((contentAt(history.value, 'footer.columns.2') as { title: string }).title, first);
  history.undo(); assert.equal(history.dirty, false); history.redo(); assert.equal(history.dirty, true);
  const path = 'pages.cuidados.sections', before = structuredClone(contentAt(history.value, path)) as { id: string }[];
  history.item(path, 'duplicate', 0);
  const sections = contentAt(history.value, path) as { id: string }[]; assert.equal(sections.length, before.length + 1); assert.equal(new Set(sections.map(s => s.id)).size, sections.length);
  history.item(path, 'remove', 0); history.undo(); assert.deepEqual(contentAt(history.value, path), sections);
  assert.equal(contentAt(history.value, '__proto__.constructor'), undefined);
  assert.throws(() => history.set('footer.missing', 'unexpected'));
  history.markSaved(history.value); assert.equal(history.dirty, false); history.undo(); assert.equal(history.dirty, true);
});
