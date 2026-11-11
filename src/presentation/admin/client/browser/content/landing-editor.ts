import { blockDefinitions, landingImage, parseLanding, type LandingBlock, type LandingLayout, type BlockType } from '../../../../../shared/landing-layout';
import { blockZone, dropBlock, duplicateBlock, locateBlock, resizeColumns } from '../../../../../shared/landing-tree';
import { apiRequest } from '../../api';
import { mountLandingDrag } from './landing-drag';
import { blockButton } from './landing-controls';
import type { ContentTree } from './content-state';
type Choices = { products: { id: string; name: string }[]; categories: { id: string; slug: string; name: string }[]; total: number };
type Options = { read(): ContentTree; edit(change: (draft: ContentTree) => void): void; select(path: string): void; changed(): void; editable(): boolean; auth(): string | undefined; notice(text: string, error?: boolean): void; uploading(value: boolean): void };
export function mountLandingEditor(form: HTMLElement, frame: HTMLIFrameElement, options: Options) {
  const library = form.querySelector<HTMLElement>('[data-content-library]')!, inspector = form.querySelector<HTMLElement>('[data-content-editor]')!;
  const layout = () => options.read().landing as LandingLayout, createId = () => crypto.randomUUID(); let active = true, uploads = 0;
  const names = new Map<string, string>();
  const apply = (next: LandingLayout, id?: string) => { options.edit(draft => { draft.landing = next; }); options.changed(); if (id) { const location = locateBlock(next, id); if (location) options.select(location.path); } };
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { options.notice(error instanceof Error ? error.message : 'No se pudo modificar el bloque.', true); } };
  for (const [type, definition] of Object.entries(blockDefinitions)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.builderType = type; button.className = 'block-library-item';
    const title = document.createElement('strong'); title.textContent = definition.label; const hint = document.createElement('small'); hint.textContent = definition.hint; button.append(title, hint); library.append(button);
  }
  const drag = mountLandingDrag(form, frame, layout, options.editable, (source, target) => attempt(() => {
    const result = dropBlock(layout(), source, target.zone, target.index, createId); apply(result.layout, result.id); options.notice('Bloque colocado. Podés deshacer este movimiento.');
  }), options.notice);
  const click = (event: Event) => {
    const node = (event.target as Element).closest<HTMLElement>('[data-builder-type], [data-block-action]'); if (!node || !options.editable()) return;
    attempt(() => {
      if (node.dataset.builderType) {
        const selected = inspector.querySelector<HTMLElement>('[data-block-inspector]')?.dataset.blockInspector, block = selected && locateBlock(layout(), selected)?.block;
        const zone = block && block.type === 'container' ? block.columns[0].id : 'root';
        const result = dropBlock(layout(), { type: node.dataset.builderType as BlockType }, zone, blockZone(layout(), zone)!.length, createId); apply(result.layout, result.id); return;
      }
      const id = node.dataset.blockId!, origin = locateBlock(layout(), id); if (!origin) return;
      const action = node.dataset.blockAction, next = structuredClone(layout()), copy = locateBlock(next, id)!;
      if (action === 'duplicate') { const result = duplicateBlock(layout(), id, createId); apply(result.layout, result.id); return; }
      if (action === 'up' || action === 'down') { const index = origin.index + (action === 'up' ? -1 : 2); if (index < 0 || index > origin.list.length) return; const result = dropBlock(layout(), { id }, origin.zone, index, createId); apply(result.layout, id); return; }
      if (action === 'remove') { copy.list.splice(copy.index, 1); apply(next); options.select('landing'); return; }
      if (action === 'clear-image') copy.block.props[node.dataset.key!] = '';
      if (['choose', 'unchoose', 'choice-up', 'choice-down'].includes(action!)) {
        const key = node.dataset.key!, values = copy.block.props[key] as string[], value = node.dataset.value!, index = values.indexOf(value);
        if (action === 'choose' && index < 0) values.push(value);
        if (action === 'unchoose' && index >= 0) values.splice(index, 1);
        if (action!.startsWith('choice-')) { const to = index + (action === 'choice-up' ? -1 : 1); if (index >= 0 && to >= 0 && to < values.length) { values.splice(index, 1); values.splice(to, 0, value); } }
      }
      apply(parseLanding(next), id);
    });
  };
  const change = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!options.editable()) return;
    if (input.dataset.blockColumns) attempt(() => apply(resizeColumns(layout(), input.dataset.blockColumns!, Number(input.value), createId), input.dataset.blockColumns));
    if (!input.dataset.blockUpload || !input.files?.[0]) return;
    const file = input.files[0], csrf = options.auth(); if (!csrf) return;
    if (file.size > 5 * 1024 * 1024) { options.notice('La imagen supera los 5 MB.', true); return; }
    const id = input.dataset.blockId!, key = input.dataset.blockUpload; input.disabled = true; uploads++; options.uploading(true); options.notice('Subiendo imagen…');
    try {
      const body = new FormData(); body.append('file', file);
      const result = await apiRequest<{ url: string }>('/admin/settings/content/media', { method: 'POST', csrf, body });
      if (!active || !options.editable()) return;
      if (typeof result.url !== 'string' || !landingImage(result.url)) throw Error('Respuesta de imagen inválida.');
      const next = structuredClone(layout()), block = locateBlock(next, id)?.block; if (!block) return; block.props[key] = result.url; apply(next, id); options.notice('Imagen incorporada al borrador.');
    } catch (error) { if (active) options.notice(error instanceof Error ? error.message : 'No se pudo subir la imagen.', true); }
    finally { input.disabled = false; uploads--; if (active) options.uploading(uploads > 0); }
  };
  async function populate(root: HTMLElement, block: LandingBlock) {
    const picker = root.querySelector<HTMLElement>('[data-block-picker]'), category = root.querySelector<HTMLSelectElement>('[data-category-select]'); if (!picker && !category) return;
    const key = picker?.dataset.blockPicker, ids = key ? block.props[key] as string[] : [];
    let page = 1, search = '', generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const button = (label: string, action: string, value: string) => { const node = blockButton(label, action, block.id); node.dataset.key = key; node.dataset.value = value; return node; };
    const showChosen = () => {
      const chosen = picker?.querySelector('[data-picker-chosen]'); if (!chosen) return; chosen.replaceChildren();
      for (const id of ids) { const row = document.createElement('div'); row.className = 'block-choice'; const text = document.createElement('span'); text.textContent = names.get(id) ?? 'Producto/categoría no disponible'; row.append(text, button('↑', 'choice-up', id), button('↓', 'choice-down', id), button('×', 'unchoose', id)); for (const [i, label] of ['Subir', 'Bajar', 'Quitar'].entries()) row.querySelectorAll('button')[i].setAttribute('aria-label', label + ' ' + text.textContent); chosen.append(row); }
    };
    const load = async () => {
      const request = ++generation;
      try {
        const data = await apiRequest<Choices>(`/admin/settings/content/choices?search=${encodeURIComponent(search)}&page=${page}`);
        if (!active || !root.isConnected || request !== generation) return;
        for (const item of [...data.products, ...data.categories]) names.set(item.id, item.name);
        if (ids.length && key === 'productIds') { const selected = await apiRequest<Choices>('/admin/settings/content/choices?ids=' + ids.map(encodeURIComponent).join(',')); if (!root.isConnected || request !== generation) return; for (const item of selected.products) names.set(item.id, item.name); }
        if (category) { for (const item of data.categories) { const option = document.createElement('option'); option.value = item.slug; option.textContent = item.name; category.append(option); } category.value = String(block.props.category); }
        if (!picker) return;
        showChosen(); const results = picker.querySelector<HTMLElement>('[data-picker-results]')!; results.replaceChildren();
        for (const item of key === 'categoryIds' ? data.categories : data.products) { const choice = button(item.name, 'choose', item.id); choice.disabled = ids.includes(item.id) || ids.length >= 24; results.append(choice); }
        if (key === 'productIds') {
          for (const [label, next, disabled] of [['Anterior', page - 1, page === 1], ['Siguiente', page + 1, page * 24 >= data.total]] as const) { const nav = document.createElement('button'); nav.type = 'button'; nav.textContent = label; nav.disabled = disabled; nav.onclick = () => { page = next; void load(); }; results.append(nav); }
        }
      } catch { if (root.isConnected) { const message = document.createElement('p'); message.textContent = 'No se pudo cargar el catálogo. Volvé a seleccionar el bloque para reintentar.'; root.append(message); } }
    };
    picker?.querySelector<HTMLInputElement>('[data-picker-search]')?.addEventListener('input', event => { clearTimeout(timer); search = (event.target as HTMLInputElement).value; page = 1; timer = setTimeout(() => { if (root.isConnected) void load(); }, 300); });
    await load();
  }
  form.addEventListener('click', click); inspector.addEventListener('change', change);
  return { render(target: string) { library.hidden = target !== 'home'; const root = inspector.querySelector<HTMLElement>('[data-block-inspector]'); if (root) { const block = locateBlock(layout(), root.dataset.blockInspector!)?.block; if (block) void populate(root, block); } }, cancel: drag.cancel,
    dispose() { active = false; drag.dispose(); form.removeEventListener('click', click); inspector.removeEventListener('change', change); } };
}
