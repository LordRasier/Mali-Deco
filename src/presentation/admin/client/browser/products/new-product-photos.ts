import { validImageFile } from '../../image-ui';
import { mediaIcon } from '../media/media-icons';

/** Ordered local photos and optional text, retained until the product is saved. */
export function mountNewProductPhotos(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('[data-new-photos-file]');
  const list = root.querySelector<HTMLOListElement>('[data-new-photos-list]');
  const note = root.querySelector<HTMLElement>('[data-new-photos-note]');
  const editor = root.querySelector<HTMLFormElement>('[data-new-photos-editor]');
  const text = root.querySelector<HTMLInputElement>('[data-new-photos-alt]');
  const title = root.querySelector<HTMLElement>('[data-new-photos-title]');
  const cancel = root.querySelector<HTMLButtonElement>('[data-new-photos-cancel]');
  const remove = root.querySelector<HTMLButtonElement>('[data-new-photos-remove]');
  if (!input || !list || !note || !editor || !text || !title || !cancel || !remove) return;
  type Entry = { file: File; url: string; alt: string };
  const document = root.ownerDocument, entries: Entry[] = [];
  let editing: Entry | undefined;
  const makeButton = (label: string, action: string, kind: 'star' | 'edit') => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute(action, ''); mediaIcon(button, kind, label); return button;
  };
  function render(warning = '') {
    const rows = entries.map(({file, url, alt}, i) => {
      const li = document.createElement('li'), thumb = document.createElement('img'), name = document.createElement('strong');
      li.className = 'image-row'; thumb.src = url; thumb.alt = alt; name.className = 'media-tile-caption';
      name.textContent = i === 0 ? 'Portada' : 'Imagen ' + (i + 1); li.title = file.name;
      const cover = makeButton(i === 0 ? 'Portada actual' : 'Usar imagen ' + (i + 1) + ' como portada', 'data-new-cover', 'star');
      cover.disabled = i === 0; cover.setAttribute('aria-pressed', String(i === 0));
      const edit = makeButton('Editar texto de imagen ' + (i + 1), 'data-new-edit', 'edit');
      edit.setAttribute('aria-expanded', String(entries[i] === editing));
      li.append(thumb, cover, edit, name); return li;
    });
    list!.replaceChildren(...rows); input!.disabled = entries.length >= 10;
    input!.parentElement?.setAttribute('aria-disabled', String(input!.disabled));
    const cover = entries[0]?.url, preview = root.querySelector<HTMLImageElement>('[data-preview-cover]');
    const placeholder = root.querySelector<HTMLElement>('[data-preview-placeholder]'), check = root.querySelector<HTMLElement>('[data-check-cover]');
    if (preview) { if (cover) preview.src = cover; else preview.removeAttribute('src'); preview.hidden = !cover; }
    if (placeholder) placeholder.hidden = !!cover;
    if (check) check.textContent = cover ? 'Portada seleccionada · sin guardar' : 'Falta una portada';
    const n = entries.length;
    note!.textContent = [warning, n ? (n === 1 ? '1 foto seleccionada.' : n + ' fotos seleccionadas.') : ''].filter(Boolean).join(' ');
    editor!.hidden = !editing;
    if (editing) title!.textContent = 'Imagen ' + (entries.indexOf(editing) + 1) + ' · ' + editing.file.name;
  }
  const add = () => {
    const notes = new Set<string>();
    for (const file of Array.from(input.files ?? [])) {
      if (!validImageFile(file)) { notes.add(file.name + ': elija un JPG, PNG o WebP de hasta 5 MiB.'); continue; }
      if (entries.length >= 10) { notes.add('El máximo es de 10 fotos.'); break; }
      entries.push({file, url: URL.createObjectURL(file), alt: ''});
    }
    input.value = ''; render([...notes].join(' '));
  };
  const finish = () => {
    const index = editing ? entries.indexOf(editing) : -1; editing = undefined; render();
    (list.children[index]?.querySelector<HTMLButtonElement>('[data-new-edit]') ?? input).focus();
  };
  const click = (event: Event) => {
    const button = (event.target as Element).closest('button'), row = button?.closest('li');
    if (!row || !button || !list.contains(row)) return;
    const i = Array.from(list.children).indexOf(row); if (i < 0 || !entries[i]) return;
    if (button.hasAttribute('data-new-cover')) { entries.unshift(...entries.splice(i, 1)); render(); list.children[0]?.querySelector<HTMLButtonElement>('[data-new-edit]')?.focus(); }
    else if (button.hasAttribute('data-new-edit')) {
      if (editing) editing.alt = text.value;
      editing = entries[i]; text.value = editing.alt; render(); text.focus();
    }
  };
  const save = (event: Event) => { event.preventDefault(); if (editing && editor.reportValidity()) { editing.alt = text.value; finish(); } };
  const discard = () => finish();
  const removeImage = () => {
    if (!editing) return; const i = entries.indexOf(editing);
    if (i >= 0) URL.revokeObjectURL(entries.splice(i, 1)[0].url);
    editing = undefined; render(); input.focus();
  };
  input.addEventListener('change', add); list.addEventListener('click', click);
  editor.addEventListener('submit', save); cancel.addEventListener('click', discard); remove.addEventListener('click', removeImage);
  return { files: () => entries.map(e => e.file), alts: () => entries.map(e => e === editing ? text.value : e.alt), hasFiles: () => entries.length > 0,
    dispose() {
      input.removeEventListener('change', add); list.removeEventListener('click', click);
      editor.removeEventListener('submit', save); cancel.removeEventListener('click', discard); remove.removeEventListener('click', removeImage);
      for (const e of entries.splice(0)) URL.revokeObjectURL(e.url);
      editing = undefined; text.value = ''; input.value = ''; list.replaceChildren();
    } };
}

