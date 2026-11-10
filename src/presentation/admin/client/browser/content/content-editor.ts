import { ApiError, apiRequest } from '../../api';
import type { sessionStore } from '../../session-store';
import { ContentHistory, contentAt, type EditorSnapshot } from './content-state';
import { selectedContentControls, contentElement as el, selectionLabel } from './content-controls';
import { renderContentOutline } from './content-outline';
import { createContentPreview } from './content-preview';
import { mountContentPanels } from './content-panels';
import { isContentSelection } from './content-selection';
import { renderContentPages } from './content-pages';

const endpoint = '/admin/settings/content/editor';
type Action = 'load' | 'draft' | 'publish' | 'restore';
export function mountContentEditor(root: HTMLElement, session: typeof sessionStore) {
  const form = root.querySelector<HTMLFormElement>('[data-content-form]'); if (!form) return () => {};
  const get = <T extends HTMLElement>(name: string) => form.querySelector<T>(`[data-content-${name}]`)!;
  const fields = get<HTMLFieldSetElement>('fields'), inspector = get('editor'), outline = get('outline');
  const message = get('message'), stateLabel = get('state'), reload = get<HTMLButtonElement>('reload'), scope = get<HTMLSelectElement>('scope');
  const history = new ContentHistory(); let snapshot: EditorSnapshot | undefined;
  let selected = 'blocks.home.hero', target = 'home', active = true, busy = false, blocked = false;
  const panels = mountContentPanels(form);
  const pageSelection = () => target === 'home' ? 'blocks.home.hero' : target === 'catalog' ? 'copy.catalog' : `pages.${target}`;
  let dragged: { path: string; index: number } | undefined;
  const epoch = session.getEpoch();
  const current = () => active && session.getEpoch() === epoch;
  const auth = () => { const state = session.getSnapshot(); return current() && state.status === 'authenticated' && state.user?.role === 'owner' ? state.csrf ?? undefined : undefined; };
  const editable = () => !!snapshot?.available && !busy && !!auth();
  const notice = (text: string, error = false) => { message.textContent = text; message.setAttribute('role', error ? 'alert' : 'status'); };
  const preview = createContentPreview(get('preview'), get('preview-status'), path => select(path), auth);
  function updateStatus() {
    const ready = editable(); fields.disabled = !ready; reload.disabled = busy; scope.disabled = !ready;
    preview.enable(ready); form!.setAttribute('aria-busy', String(busy));
    stateLabel.textContent = history.dirty ? 'Cambios sin guardar' : snapshot?.hasDraft ? 'Borrador guardado · sin publicar' : 'Versión publicada';
    for (const node of form!.querySelectorAll<HTMLButtonElement>('[data-content-command]')) {
      const command = node.dataset.contentCommand;
      node.disabled = !ready || (command === 'undo' && !history.canUndo) || (command === 'redo' && !history.canRedo) ||
        (['draft', 'publish'].includes(command!) && (blocked || !!snapshot?.stale));
    }
  }
  function select(path: string) {
    if (!isContentSelection(path, key => contentAt(history.value, key))) return;
    const nextTarget = path.startsWith('pages.') ? path.split('.')[1] : path === 'copy.home' ? 'home' : path === 'copy.catalog' ? 'catalog' : target;
    const switched = target !== nextTarget; target = nextTarget; scope.value = target; selected = path;
    render(); panels.inspect(); preview.select(selected, true); if (switched) preview.update(history.value, target);
  }
  function render() {
    if (!snapshot) return;
    if (!isContentSelection(selected, key => contentAt(history.value, key))) selected = pageSelection();
    const focus = (document.activeElement as HTMLElement | null)?.dataset.contentPath;
    const key = selected.split('.').at(-1)!;
    get('selection').textContent = selectionLabel(selected, contentAt(history.value, selected));
    inspector.replaceChildren(selectedContentControls(selected, path => contentAt(history.value, path)));
    const listPath = selected.split('.').slice(0, -1).join('.'), list = contentAt(history.value, listPath);
    if (/^\d+$/.test(key) && Array.isArray(list)) {
      const actions = el('div'); actions.className = 'content-actions';
      for (const [action, title] of [['up', 'Subir'], ['down', 'Bajar'], ['duplicate', 'Duplicar'], ['remove', 'Quitar']]) {
        const button = el('button', title); button.type = 'button'; button.dataset.contentAction = action; button.dataset.path = listPath; button.dataset.index = key;
        button.disabled = action === 'up' && Number(key) === 0 || action === 'down' && Number(key) === list.length - 1; actions.append(button);
      }
      inspector.prepend(actions);
    }
    renderContentOutline(outline, history.value, target, selected);
    renderContentPages(get('pages'), scope, history.value, target);
    if (focus) Array.from(inspector.querySelectorAll<HTMLElement>('[data-content-path]')).find(node => node.dataset.contentPath === focus)?.focus();
    preview.select(selected); updateStatus();
  }
  function changed(refresh = true) {
    if (refresh) render(); else updateStatus();
    preview.update(history.value, target);
  }
  async function run(action: Action) {
    const csrf = auth(); if (!csrf || busy || !current() || action !== 'load' && (!snapshot?.available || (blocked || snapshot.stale) && action !== 'restore')) return;
    busy = true; updateStatus(); notice('');
    try {
      const versions = { revision: snapshot?.revision, publishedRevision: snapshot?.publishedRevision };
      const result = await apiRequest<EditorSnapshot>(endpoint + (action === 'load' ? '' : `/${action}`), action === 'load' ? undefined : {
        method: action === 'draft' ? 'PUT' : 'POST', csrf,
        body: { ...versions, ...(action === 'restore' ? {} : { settings: history.value }) },
      });
      if (!current()) return;
      if (!result.settings?.pages || !result.settings?.footer || !result.settings?.copy || !Number.isSafeInteger(result.revision) || !Number.isSafeInteger(result.publishedRevision) ||
          typeof result.available !== 'boolean' || typeof result.hasDraft !== 'boolean' || typeof result.stale !== 'boolean' ||
          action !== 'load' && (result.revision !== versions.revision! + 1 || result.publishedRevision !== versions.publishedRevision! + (action === 'publish' ? 1 : 0))) {
        blocked = true; throw Error('No se pudo confirmar el resultado. Recargá el contenido antes de reintentar.');
      }
      snapshot = result; blocked = false;
      if (action === 'load' || action === 'restore') history.load(result.settings); else history.markSaved(result.settings);
      render(); preview.update(history.value, target);
      notice(!result.available ? 'Falta aplicar la nueva migración de contenido para habilitar borradores.' : result.stale ? 'La tienda se publicó desde otra sesión. Este borrador se conserva; compará los cambios antes de restaurar la versión publicada.' :
        action === 'draft' ? 'Borrador guardado. La tienda publicada no cambió.' : action === 'publish' ? 'Contenido publicado. Los textos y las rutas ya están actualizados.' :
          action === 'restore' ? 'Borrador restaurado desde la versión publicada.' : 'Seleccioná un elemento de la vista previa o de la estructura.');
    } catch (error) {
      if (current()) {
        if (error instanceof ApiError && [0, 409, 500, 502, 503].includes(error.status)) blocked = true;
        notice(error instanceof Error ? error.message : 'No se pudo completar la operación.', true);
      }
    } finally { busy = false; if (current()) updateStatus(); }
  }
  const input = (event: Event) => {
    if (!editable()) return;
    const node = event.target as HTMLInputElement;
    if (node.dataset.contentPath) { history.set(node.dataset.contentPath, node.type === 'checkbox' ? node.checked : node.value); changed(node.tagName === 'SELECT' || node.type === 'checkbox'); }
    if (node.dataset.contentInherit) { history.set(node.dataset.contentInherit, node.checked ? null : ''); changed(); }
  };
  const click = (event: Event) => {
    const node = (event.target as Element).closest<HTMLElement>('[data-content-select], [data-content-action], [data-content-command], [data-content-page]');
    if (!node || !editable()) return;
    if (node.dataset.contentPage) { scope.value = node.dataset.contentPage; changeScope(); return; }
    if (node.dataset.contentSelect) { select(node.dataset.contentSelect); return; }
    const command = node.dataset.contentCommand;
    if (command === 'undo' || command === 'redo') { history[command](); changed(); return; }
    if (command === 'draft' || command === 'publish') { void run(command); return; }
    if (command === 'restore') { if (window.confirm('Esto reemplaza el borrador y los cambios sin guardar por el contenido publicado. ¿Continuar?')) void run('restore'); return; }
    const path = node.dataset.path!, index = Number(node.dataset.index), action = node.dataset.contentAction;
    try {
      if (action === 'up' || action === 'down') { const next = index + (action === 'up' ? -1 : 1); history.move(path, index, next); if (selected === `${path}.${index}`) selected = `${path}.${next}`; }
      else if (action === 'add' || action === 'duplicate' || action === 'remove') { history.item(path, action, index); if (action === 'remove') selected = path; }
      changed();
    } catch (error) { notice(error instanceof Error ? error.message : 'No se pudo modificar el bloque.', true); }
  };
  const changeScope = () => { target = scope.value; selected = pageSelection(); render(); panels.show('structure'); preview.update(history.value, target); };
  const viewport = () => preview.viewport(get<HTMLSelectElement>('viewport').value);
  const refresh = () => { if (!history.dirty || window.confirm('Recargar descarta los cambios sin guardar. ¿Continuar?')) void run('load'); };
  const save = (event: Event) => { event.preventDefault(); void run('draft'); };
  const leave = (event: BeforeUnloadEvent) => { if (history.dirty) event.preventDefault(); };
  const startDrag = (event: DragEvent) => {
    const node = (event.target as Element).closest<HTMLElement>('[data-drag-list]');
    if (!editable() || !node) { event.preventDefault(); return; }
    dragged = { path: node.dataset.dragList!, index: Number(node.dataset.dragIndex) }; event.dataTransfer?.setData('text/plain', node.textContent ?? '');
  };
  const dragOver = (event: DragEvent) => { if (editable() && dragged && (event.target as Element).closest<HTMLElement>('[data-drag-list]')?.dataset.dragList === dragged.path) event.preventDefault(); };
  const drop = (event: DragEvent) => {
    event.preventDefault(); const node = (event.target as Element).closest<HTMLElement>('[data-drag-list]');
    if (editable() && dragged && node?.dataset.dragList === dragged.path) {
      const index = Number(node.dataset.dragIndex); history.move(dragged.path, dragged.index, index); selected = `${dragged.path}.${index}`; changed();
    }
    dragged = undefined;
  };
  const endDrag = () => { dragged = undefined; };
  const typing = (event: Event) => { if ((event.target as HTMLElement).tagName === 'TEXTAREA') input(event); };
  form.addEventListener('submit', save); form.addEventListener('click', click); inspector.addEventListener('input', typing); inspector.addEventListener('change', input);
  scope.addEventListener('change', changeScope); get('viewport').addEventListener('change', viewport); reload.addEventListener('click', refresh); window.addEventListener('beforeunload', leave);
  outline.addEventListener('dragstart', startDrag); outline.addEventListener('dragover', dragOver); outline.addEventListener('drop', drop); outline.addEventListener('dragend', endDrag); void run('load');
  return () => {
    active = false; fields.disabled = true; scope.disabled = true; preview.dispose(); panels.dispose();
    form.removeEventListener('submit', save); form.removeEventListener('click', click); inspector.removeEventListener('input', typing); inspector.removeEventListener('change', input);
    scope.removeEventListener('change', changeScope); get('viewport').removeEventListener('change', viewport); reload.removeEventListener('click', refresh); window.removeEventListener('beforeunload', leave);
    outline.removeEventListener('dragstart', startDrag); outline.removeEventListener('dragover', dragOver); outline.removeEventListener('drop', drop); outline.removeEventListener('dragend', endDrag);
  };
}
