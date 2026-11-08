import type { AdminMediaStore, MediaItem, MediaSnapshot } from './media-state';
import { mediaIcon } from './media-icons';

/** A keyed row keeps native edit controls mounted through metadata reloads. */
export function createMediaRow(document: Document, store: AdminMediaStore, id: string, editorHost?: HTMLElement) {
  const listeners: (() => void)[] = [];
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const listen = (node: HTMLElement, event: string, callback: (event: Event) => void) => { node.addEventListener(event, callback); listeners.push(() => node.removeEventListener(event, callback)); };
  const button = (name: string, text: string, callback: () => void) => {
    const node = element('button', text); node.type = 'button'; node.setAttribute('data-media-action', name);
    listen(node, 'click', () => { if (!node.disabled) callback(); }); return node;
  };
  let index = 0, lastEdit = '', wasEditing = false;
  const root = element('li'); root.className = 'image-row';
  const image = element('img'); image.src = `/api/v1${store.path}/${encodeURIComponent(id)}/content?w=320`; image.alt = ''; image.width = 96; image.height = 96;
  const details = element('div'); details.className = 'image-details';
  const title = element('strong'), dimensions = element('span'), alt = element('p');
  const form = element('form'); form.method = 'dialog'; form.className = 'media-text-editor';
  const editorTitle = element('strong');
  const label = element('label', 'Texto alternativo (opcional)'), input = element('input'); input.maxLength = 300; input.setAttribute('data-media-action', 'edit-alt'); label.append(input);
  const save = element('button', 'Guardar'); save.type = 'submit';
  const cancel = button('cancel', 'Cancelar', () => store.cancelEdit());
  const controls = element('div'); controls.className = 'actions';
  const edit = button('edit', 'Editar texto', () => { store.edit(id); if (!root.closest('[hidden]')) input.focus(); });
  const up = button('up', 'Subir', () => { void store.move(id, index - 1); });
  const down = button('down', 'Bajar', () => { void store.move(id, index + 1); });
  const primary = button('primary', 'Usar como portada', () => { void store.move(id, 0); });
  const retire = button('retire', 'Retirar', () => { void store.retire(id); });
  const restore = button('restore', 'Restaurar al final', () => { void store.restore(id); });
  mediaIcon(primary, 'star', 'Usar como portada'); mediaIcon(edit, 'edit', 'Editar texto alternativo');
  const editorActions = element('div'); editorActions.className = 'actions'; editorActions.append(save, cancel, up, down, retire);
  form.append(editorTitle, dimensions, label, editorActions);
  controls.append(primary, edit); details.append(title, alt, restore); root.append(image, controls, details, form);
  listen(input, 'input', () => store.setEditAlt(input.value));
  listen(form, 'submit', event => { event.preventDefault(); if (save.disabled || !form.reportValidity()) return; store.setEditAlt(input.value); void store.saveAlt(); });
  return {
    root,
    update(item: MediaItem, position: number, state: MediaSnapshot) {
      index = position;
      const cover = !item.retired && position === 0;
      root.setAttribute('data-media-retired', String(item.retired));
      title.textContent = item.retired ? 'Imagen retirada' : cover ? 'Portada' : `Imagen ${position + 1}`;
      if (cover) title.setAttribute('data-media-cover', ''); else title.removeAttribute('data-media-cover');
      editorTitle.textContent = `Imagen ${position + 1}${cover ? ' · Portada' : ''}`;
      image.alt = item.alt;
      dimensions.textContent = `${item.width} × ${item.height} px`; alt.textContent = `Texto alternativo: ${item.alt || 'Sin texto'}`;
      const editing = state.editing === id && !item.retired;
      form.hidden = !editing; alt.hidden = true; controls.hidden = item.retired || state.readOnly;
      const formHost = editing && editorHost ? editorHost : root;
      if (form.parentElement !== formHost) formHost.append(form);
      restore.hidden = !item.retired || state.readOnly;
      if (editing && (!wasEditing || lastEdit !== state.editAlt)) input.value = state.editAlt;
      lastEdit = state.editAlt; wasEditing = editing;
      input.disabled = save.disabled = edit.disabled = retire.disabled = state.disabled;
      primary.disabled = state.disabled || cover;
      cancel.disabled = state.busy; up.disabled = state.disabled || position === 0; down.disabled = state.disabled || position === state.active.length - 1;
      primary.hidden = false; primary.setAttribute('aria-pressed', String(cover));
      primary.setAttribute('aria-label', cover ? 'Portada actual' : `Usar imagen ${position + 1} como portada`);
      primary.title = cover ? 'Portada actual' : 'Usar como portada';
      edit.setAttribute('aria-label', `Editar texto de imagen ${position + 1}`); edit.setAttribute('aria-expanded', String(editing));
      restore.disabled = state.disabled || state.active.length >= 10;
      up.setAttribute('aria-label', `Subir imagen ${position + 1}`); down.setAttribute('aria-label', `Bajar imagen ${position + 1}`);
    },
    focusEdit(fallback: HTMLElement) { (edit.disabled ? fallback : edit).focus(); },
    dispose() { for (const remove of listeners) remove(); input.value = ''; form.remove(); root.remove(); },
  };
}
