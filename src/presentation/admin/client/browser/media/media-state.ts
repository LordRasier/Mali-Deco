import { apiRequest, ApiError, type RequestOptions } from '../../api';
import { canManageCatalog, type createSessionStore } from '../../session-core';
import { createUploadIntent } from '../../upload-intent';
import { imageUploadRejected, mediaErrorMessage, validImageFile } from '../../image-ui';
import { parseMediaList, type MediaItem, type MediaList } from './media-types';
export type { MediaItem, MediaList } from './media-types';

export type MediaSession = Pick<ReturnType<typeof createSessionStore>, 'getSnapshot' | 'getEpoch' | 'subscribe' | 'expire'>;
export type MediaRequest = (path: string, options?: RequestOptions) => Promise<unknown>;
export type UploadEntry = {
  id: number; name: string; file: File | null; status: 'pending' | 'uploading' | 'failed' | 'success';
  error: string; uncertain: boolean; alt?: string; intent: ReturnType<typeof createUploadIntent>;
};
export type MediaSnapshot = {
  data: MediaList | null; active: MediaItem[]; retired: MediaItem[]; loading: boolean; busy: boolean;
  error: string; message: string; needsReload: boolean; queue: UploadEntry[]; file: File | null; alt: string;
  editing: string | null; editAlt: string; readOnly: boolean; disabled: boolean; allowed: boolean;
  uploadReset: number; focusRequest: number; focusTarget: string | null;
};
const reloadMessage = 'Las imágenes cambiaron en otra sesión. Recargá la lista antes de continuar.';
const uncertainMessage = 'No se pudo confirmar el resultado. Recargá la lista antes de reintentar.';

/** One retained owner per product and authentication identity. Hiding a section is not disposal. */
export function createAdminMedia(session: MediaSession, productId: string, readOnly: boolean,
  { request = apiRequest, makeKey, initialFiles, initialAlts }: { request?: MediaRequest; makeKey?: () => string; initialFiles?: readonly File[]; initialAlts?: readonly string[] } = {}) {
  let nextEntry = 0;
  const path = `/admin/catalog/products/${encodeURIComponent(productId)}/images`, listeners = new Set<() => void>();
  const serverSnapshot: MediaSnapshot = { data: null, active: [], retired: [], loading: true, busy: false, error: '', message: '', needsReload: false,
    queue: [], file: null, alt: '', editing: null, editAlt: '', readOnly, disabled: true, allowed: false, uploadReset: 0, focusRequest: 0, focusTarget: null };
  let state = serverSnapshot, active = false, disposed = false, revoked = false, generation = 0, lifecycle = 0, readId = 0;
  let sendOnFirstRead = false;
  let owner: string | null = null, unsubscribe: (() => void) | undefined;
  const identity = () => { const auth = session.getSnapshot(); return JSON.stringify([session.getEpoch(), auth.status, auth.user?.id, auth.user?.role, auth.csrf]); };
  const authorized = () => !revoked && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  const current = (epoch: number) => active && generation === epoch && authorized() && owner === identity();
  const publish = (patch: Partial<MediaSnapshot>) => {
    const next = { ...state, ...patch };
    next.active = (next.data?.items ?? []).filter(item => !item.retired).sort((a, b) => a.position - b.position);
    next.retired = (next.data?.items ?? []).filter(item => item.retired);
    next.file = next.queue.find(entry => entry.file)?.file ?? null;
    next.allowed = active && authorized();
    next.disabled = !next.allowed || !session.getSnapshot().csrf || next.readOnly || next.busy || next.loading || next.needsReload || !next.data;
    state = next; for (const listener of listeners) listener();
  };
  const focus = (target = 'heading') => ({ focusTarget: target, focusRequest: state.focusRequest + 1 });
  function revoke() {
    initialFiles = undefined; initialAlts = undefined; sendOnFirstRead = false;
    revoked = true; generation++; readId++;
    publish({ data: null, queue: [], file: null, alt: '', editing: null, editAlt: '', loading: false, busy: false, error: '', message: '', needsReload: false, uploadReset: state.uploadReset + 1 });
  }
  async function load() {
    if (!active || !authorized() || state.busy || (state.loading && readId > 0)) return;
    const epoch = generation, read = ++readId;
    const accepts = () => current(epoch) && readId === read;
    publish({ loading: true, error: '', message: '' });
    if (!accepts()) return;
    try {
      const data = parseMediaList(await request(path));
      if (!accepts()) return;
      publish({ data, loading: false, needsReload: false });
      if (sendOnFirstRead && accepts()) {
        sendOnFirstRead = false;
        if (!state.active.length) void upload();
        else publish({ message: 'La galería ya contiene fotos. Revise la portada antes de subir la selección pendiente.' });
      }
    } catch (failure) {
      if (!accepts()) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      publish({ loading: false, needsReload: true, error: failure instanceof Error ? failure.message : 'No se pudieron cargar las imágenes.' });
    }
  }
  function sessionChanged() {
    if (!active || revoked) return;
    if (owner !== null && owner !== identity()) { revoke(); return; }
    if (!authorized()) { publish({ loading: false }); return; }
    owner ??= identity(); publish({});
    if (!state.data && !state.needsReload && !state.loading) void load();
  }
  const canWrite = () => active && authorized() && owner === identity() && !state.disabled;
  // Writes are serialized by the caller. Never let a late result mutate a new owner's state.
  async function write(epoch: number, target: string, options: RequestOptions) {
    if (!current(epoch)) return;
    try {
      const data = parseMediaList(await request(target, { ...options, csrf: session.getSnapshot().csrf!, ifMatch: state.data!.revision }));
      if (current(epoch)) return { data };
    } catch (failure) {
      if (!current(epoch)) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      const status = failure instanceof ApiError ? failure.status : 0;
      const conflict = status === 412 || status === 428, uncertain = !status || status >= 500;
      const error = conflict ? reloadMessage : failure instanceof ApiError
        ? mediaErrorMessage(status, failure.code) ?? (options.idempotencyKey && status === 400 ? imageUploadRejected : failure.message)
        : uncertainMessage;
      return { error, uncertain, needsReload: conflict || uncertain, continueBatch: status === 400 || status === 413 };
    }
  }
  async function mutate(method: 'POST' | 'PUT' | 'DELETE', target: string, body?: unknown, success?: 'edit' | 'heading') {
    if (!canWrite()) return false;
    const epoch = generation;
    publish({ busy: true, error: '', message: '' });
    const result = await write(epoch, target, { method, body });
    if (!result || !current(epoch)) return false;
    if (!result.data) { publish({ busy: false, error: result.error, needsReload: result.needsReload }); return false; }
    publish({ data: result.data, busy: false, message: 'Cambios guardados.',
      ...(success === 'edit' ? { editing: null, editAlt: '' } : {}), ...(success ? focus() : {}) });
    return true;
  }
  function queueEntries(files: readonly File[], alts?: readonly string[]) {
    return files.map((file, index): UploadEntry => ({
      id: ++nextEntry, file, name: file.name, status: 'pending', error: '', uncertain: false, alt: alts?.[index], intent: createUploadIntent(makeKey),
    }));
  }
  function setFiles(files: File[]) {
    if (!canWrite() || (files.length === state.queue.length && files.every((file, i) => file === state.queue[i].file))) return;
    sendOnFirstRead = false;
    publish({ queue: queueEntries(files), alt: files.length === 1 ? state.alt : '', error: '', message: '' });
  }
  const patchEntry = (id: number, patch: Partial<UploadEntry>) => state.queue.map(item => item.id === id ? { ...item, ...patch } : item);
  async function sendFiles(entries: UploadEntry[]) {
    if (!canWrite() || !entries.length) return false;
    const epoch = generation;
    publish({ busy: true, error: '', message: '' });
    for (const entry of entries) {
      if (!current(epoch)) return false;
      // An uncertain tenth upload can be replayed with its original key even when the refreshed list is full.
      if (!entry.file || (state.active.length >= 10 && !entry.uncertain)) break;
      if (!validImageFile(entry.file)) {
        const error = 'El archivo debe ser JPG, PNG o WebP y pesar hasta 5 MiB.';
        publish({ error, queue: patchEntry(entry.id, { status: 'failed', error }) }); continue;
      }
      const body = new FormData(); body.append('file', entry.file); body.append('alt', entry.alt ?? state.alt);
      publish({ queue: patchEntry(entry.id, { status: 'uploading', error: '' }) });
      const result = await write(epoch, path, { method: 'POST', body, idempotencyKey: entry.intent.key() });
      if (!current(epoch) || !result) return false;
      if (result.data) {
        publish({ data: result.data, queue: patchEntry(entry.id, { status: 'success', file: null, uncertain: false }) });
      } else {
        publish({ error: result.error, needsReload: result.needsReload,
          queue: patchEntry(entry.id, { status: 'failed', error: result.error, uncertain: result.uncertain }) });
        if (!result.continueBatch) break;
      }
    }
    if (!current(epoch)) return false;
    const complete = state.queue.every(item => item.status === 'success');
    publish({ busy: false, ...(complete ? { alt: '', error: '', message: 'Carga completada.', uploadReset: state.uploadReset + 1 } : {}) });
    return complete;
  }
  const retry = (id: number) => sendFiles(state.queue.filter(item => item.id === id && item.status === 'failed'));
  function upload() {
    if (state.queue.length === 1 && state.queue[0].status === 'failed') return retry(state.queue[0].id);
    return sendFiles(state.queue.filter(item => item.status === 'pending'));
  }
  function interrupted() {
    const uncertain = state.busy;
    return { loading: false, busy: false, needsReload: state.needsReload || uncertain,
      queue: state.queue.map((item): UploadEntry => item.status === 'uploading'
        ? { ...item, status: 'failed', uncertain: true, error: uncertainMessage } : item),
      ...(uncertain ? { error: uncertainMessage } : {}) };
  }
  function stop() {
    if (!active) return;
    active = false; generation++; lifecycle++; readId++; unsubscribe?.(); unsubscribe = undefined;
    publish(interrupted());
  }
  function start() {
    if (disposed) throw new Error('Media store is disposed');
    if (active) throw new Error('Media store already started');
    active = true; const epoch = ++generation, lifetime = ++lifecycle;
    if (owner !== null && owner !== identity()) revoke();
    if (authorized()) owner ??= identity();
    unsubscribe = session.subscribe(sessionChanged);
    const selected = initialFiles, selectedAlts = initialAlts;
    initialFiles = undefined; initialAlts = undefined;
    if (selected?.length && !state.readOnly && current(epoch) && session.getSnapshot().csrf) {
      sendOnFirstRead = true; publish({ loading: false, queue: queueEntries(selected, selectedAlts), alt: selected.length === 1 ? selectedAlts?.[0] ?? '' : '' });
    } else publish({ loading: false });
    if (current(epoch) && !state.data && !state.needsReload) void load();
    return () => { if (active && lifecycle === lifetime) stop(); };
  }
  return {
    path, start, stop, load, upload, retry, setFiles,
    discardSelection() {
      if (!state.allowed || state.busy) return;
      sendOnFirstRead = false;
      const needsReload = state.needsReload || state.queue.some(item => item.uncertain);
      publish({ queue: [], alt: '', uploadReset: state.uploadReset + 1, error: '', needsReload,
        message: needsReload ? 'Selección descartada. Recargue las imágenes para verificar el resultado.' : 'Selección descartada. Las imágenes guardadas no se modificaron.' });
    },
    getSnapshot: () => state, getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setReadOnly(value: boolean) {
      if (state.readOnly === value) return;
      generation++; readId++; publish({ readOnly: value, ...interrupted() });
      if (active && !state.data && !state.needsReload) void load();
    },
    setFile(file: File | null) { setFiles(file ? [file] : []); },
    setAlt(alt: string) {
      if (canWrite() && state.queue.length <= 1 && !state.queue[0]?.uncertain && alt !== state.alt) {
        state.queue[0]?.intent.reset(); publish({ alt, queue: state.queue.map(entry => ({ ...entry, alt })) });
      }
    },
    edit(id: string) { const item = state.active.find(item => item.id === id); if (canWrite() && item) publish({ editing: id, editAlt: item.alt }); },
    setEditAlt(editAlt: string) { if (canWrite() && state.editing) publish({ editAlt }); },
    cancelEdit() { if (!state.busy && state.editing) publish({ editing: null, editAlt: '', ...focus(state.editing) }); },
    saveAlt() {
      if (!state.editing || !state.active.some(item => item.id === state.editing)) return Promise.resolve(false);
      return mutate('PUT', `${path}/${encodeURIComponent(state.editing)}`, { alt: state.editAlt }, 'edit');
    },
    move(id: string, destination: number) {
      const ids = state.active.map(item => item.id), index = ids.indexOf(id);
      if (index < 0 || !Number.isInteger(destination) || destination < 0 || destination >= ids.length || index === destination) return Promise.resolve(false);
      ids.splice(index, 1); ids.splice(destination, 0, id); return mutate('PUT', `${path}/order`, { ids });
    },
    retire(id: string) { return state.active.some(item => item.id === id) ? mutate('DELETE', `${path}/${encodeURIComponent(id)}`, undefined, 'heading') : Promise.resolve(false); },
    restore(id: string) { return state.active.length < 10 && state.retired.some(item => item.id === id) ? mutate('POST', `${path}/${encodeURIComponent(id)}/restore`, undefined, 'heading') : Promise.resolve(false); },
    dispose() { if (disposed) return; disposed = true; stop(); publish({ data: null, queue: [], file: null, alt: '', editing: null, editAlt: '', uploadReset: state.uploadReset + 1 }); listeners.clear(); },
  };
}
export type AdminMediaStore = ReturnType<typeof createAdminMedia>;
