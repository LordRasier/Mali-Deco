import { imageUploadHelp, mediaStorageHelp } from '../../image-ui';
import { createAdminMedia, type AdminMediaStore, type MediaSession } from './media-state';
import { createMediaRow } from './media-row';
import { mountUploadQueue } from './media-queue-view';

/** The parent retains this exact slot while hiding or refreshing the same product. */
export function mountAdminMedia(root: HTMLElement, session: MediaSession, productId: string, readOnly: boolean, options: { store?: AdminMediaStore; initialFiles?: readonly File[]; initialAlts?: readonly string[] } = {}) {
  const store = options.store ?? createAdminMedia(session, productId, readOnly, { initialFiles: options.initialFiles, initialAlts: options.initialAlts });
  const get = <T extends HTMLElement = HTMLElement>(name: string) => {
    const value = root.querySelector<T>(`[data-media-${name}]`); if (!value) throw new Error(`Missing media element: ${name}`); return value;
  };
  const file = get<HTMLInputElement>('file'), alt = get<HTMLInputElement>('alt'), form = get<HTMLFormElement>('upload');
  const submit = get<HTMLButtonElement>('submit'), reload = get<HTMLButtonElement>('reload'), heading = get('heading');
  const discard = get<HTMLButtonElement>('discard');
  const addTile = get('add'), editorHost = get('editor');
  const activeList = get('active'), retiredList = get('retired'), rows = new Map<string, ReturnType<typeof createMediaRow>>();
  const queue = mountUploadQueue(get('queue'), get('queue-summary'), store);
  let lastList = store.getServerSnapshot().data;
  let reset = -1, lastAlt = '', focused = 0, disposed = false;
  get('upload-help').textContent = imageUploadHelp; get('storage-help').textContent = mediaStorageHelp;
  const render = () => {
    const state = store.getSnapshot();
    root.setAttribute('aria-busy', String(state.loading || state.busy)); get('loading').hidden = !state.loading;
    get('content').hidden = !state.data; get('error').textContent = state.error; get('error').hidden = !state.error;
    get('message').textContent = state.message; get('message').hidden = !state.message;
    reload.hidden = !(state.needsReload || (!state.data && state.error)); reload.disabled = state.loading || state.busy || !state.allowed;
    form.hidden = state.readOnly || (!state.alt && !state.queue.some(item => item.status !== 'success'));
    addTile.hidden = state.readOnly;
    file.disabled = state.disabled || state.active.length >= 10 || state.queue.some(item => item.uncertain);
    addTile.setAttribute('aria-disabled', String(file.disabled));
    editorHost.hidden = state.readOnly || !state.active.some(item => item.id === state.editing);
    discard.hidden = !state.alt && !state.queue.some(item => item.status !== 'success');
    discard.disabled = discard.hidden || !state.allowed || state.busy;
    const singleRetry = state.queue.length === 1 && state.queue[0].status === 'failed';
    const pending = state.queue.filter(item => item.status === 'pending').length;
    get('alt-label').hidden = state.queue.length > 1; alt.disabled = file.disabled || state.queue.length > 1 || !!state.queue[0]?.uncertain;
    submit.disabled = state.disabled || (!pending && !singleRetry) || (state.active.length >= 10 && !(singleRetry && state.queue[0].uncertain));
    submit.textContent = singleRetry ? 'Reintentar carga' : pending > 1 ? `Subir ${pending} imágenes` : 'Subir imagen';
    get('limit').hidden = state.active.length < 10; queue.update(state);
    get('empty').hidden = !!state.active.length; get('retired-box').hidden = !state.retired.length;
    if (reset !== state.uploadReset) { reset = state.uploadReset; file.value = ''; }
    if (lastAlt !== state.alt) alt.value = state.alt;
    lastAlt = state.alt;
    const ids = new Set((state.data?.items ?? []).map(item => item.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.dispose(); rows.delete(id); }
    for (const [items, list] of [[state.active, activeList], [state.retired, retiredList]] as const) {
      items.forEach((item, index) => {
        let row = rows.get(item.id);
        if (!row) { row = createMediaRow(root.ownerDocument, store, item.id, editorHost); rows.set(item.id, row); }
        row.update(item, index, state);
        if (list.children[index] !== row.root) list.insertBefore(row.root, list.children[index] ?? null);
      });
    }
    if (state.focusRequest !== focused) {
      focused = state.focusRequest;
      if (!root.closest('[hidden]')) {
        if (state.focusTarget && state.focusTarget !== 'heading' && rows.has(state.focusTarget)) rows.get(state.focusTarget)!.focusEdit(heading);
        else heading.focus();
      }
    }
    if (state.data && state.data !== lastList) {
      lastList = state.data; const cover = state.active[0];
      root.dispatchEvent(new CustomEvent('product-media-updated', { bubbles: true, detail: {
        coverUrl: cover ? `/api/v1${store.path}/${encodeURIComponent(cover.id)}/content?w=320` : null, count: state.active.length,
      } }));
    }
  };
  const pick = () => store.setFiles(Array.from(file.files ?? [])), editAlt = () => store.setAlt(alt.value), refresh = () => { void store.load(); };
  const upload = (event: Event) => { event.preventDefault(); if (submit.disabled || !form.reportValidity()) return; store.setAlt(alt.value); void store.upload(); };
  const discardSelection = () => {
    if (discard.disabled) return;
    if (store.getSnapshot().queue.some(item => item.uncertain) && !root.ownerDocument.defaultView?.confirm(
      'La carga podría haberse completado. Si descarta la selección, no podrá reintentar esa carga. Recargue las imágenes para comprobar el resultado. ¿Descartar la selección?',
    )) return;
    store.discardSelection();
    if (!root.closest('[hidden]')) (reload.hidden ? heading : reload).focus();
  };
  discard.addEventListener('click', discardSelection);
  file.addEventListener('change', pick); alt.addEventListener('input', editAlt); reload.addEventListener('click', refresh); form.addEventListener('submit', upload);
  const unsubscribe = store.subscribe(render), stop = store.start(); render();
  return {
    activity(): 'writing' | 'pending' | 'clear' {
      const state = store.getSnapshot();
      if (disposed || !state.allowed) return 'clear';
      if (state.busy) return 'writing';
      const editing = state.active.find(item => item.id === state.editing);
      return state.queue.some(item => item.status !== 'success') || state.alt || (editing && state.editAlt !== editing.alt) ? 'pending' : 'clear';
    },
    setReadOnly(value: boolean) { if (!disposed) store.setReadOnly(value); },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribe(); stop(); store.dispose();
      discard.removeEventListener('click', discardSelection); discard.disabled = true;
      file.removeEventListener('change', pick); alt.removeEventListener('input', editAlt); reload.removeEventListener('click', refresh); form.removeEventListener('submit', upload);
      for (const row of rows.values()) row.dispose(); rows.clear(); queue.dispose(); file.value = ''; alt.value = ''; get('content').hidden = true;
      get('error').textContent = get('message').textContent = '';
      file.disabled = alt.disabled = submit.disabled = reload.disabled = true;
    },
  };
}
