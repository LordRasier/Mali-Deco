import type { AdminMediaStore, MediaSnapshot, UploadEntry } from './media-state';

const labels = { pending: 'Pendiente', uploading: 'Subiendo…', failed: 'No se pudo completar', success: 'Subida' };

export function mountUploadQueue(list: HTMLElement, summary: HTMLElement, store: AdminMediaStore) {
  const document = list.ownerDocument;
  function createRow(entry: UploadEntry) {
    const row = document.createElement('li'), name = document.createElement('strong');
    const result = document.createElement('span'), retry = document.createElement('button');
    name.textContent = entry.name;
    retry.type = 'button'; retry.textContent = 'Reintentar'; retry.setAttribute('data-media-action', 'retry');
    retry.setAttribute('aria-label', 'Reintentar la carga de ' + entry.name);
    const id = entry.id, click = () => { if (!retry.disabled) void store.retry(id); };
    retry.addEventListener('click', click);
    row.append(name, result, retry); list.append(row);
    return {
      update(item: UploadEntry, state: MediaSnapshot) {
        row.setAttribute('data-upload-status', item.status);
        result.textContent = labels[item.status] + (item.error ? ': ' + item.error : '');
        retry.hidden = item.status !== 'failed';
        retry.disabled = retry.hidden || state.disabled || (state.active.length >= 10 && !item.uncertain);
      },
      remove() { retry.removeEventListener('click', click); row.remove(); },
    };
  }
  const rows = new Map<number, ReturnType<typeof createRow>>();
  return {
    update(state: MediaSnapshot) {
      const ids = new Set(state.queue.map(item => item.id));
      for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
      for (const item of state.queue) {
        let row = rows.get(item.id); if (!row) { row = createRow(item); rows.set(item.id, row); }
        row.update(item, state);
      }
      const count = (status: UploadEntry['status']) => state.queue.filter(item => item.status === status).length;
      const progress = state.queue.length ? `Archivos: ${state.queue.length} · Subidos: ${count('success')} · Pendientes: ${count('pending')} · Con error: ${count('failed')}.` : '';
      if (summary.textContent !== progress) summary.textContent = progress;
      list.hidden = !state.queue.length;
    },
    dispose() { for (const row of rows.values()) row.remove(); rows.clear(); summary.textContent = ''; },
  };
}
