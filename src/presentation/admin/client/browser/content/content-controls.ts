import { editorTargets, fieldLabels } from './content-fields';
import type { ContentTree } from './content-state';
import { contentGroups, contentParent, contentSource } from './content-selection';

export const contentElement = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
};
export function selectionLabel(path: string, value: unknown): string {
  if (Object.hasOwn(contentGroups, path)) return contentGroups[path].label;
  const source = contentSource(path); if (source) return source.label;
  if (/\.paragraphs\.\d+$/.test(path)) return `Párrafo ${Number(path.split('.').at(-1)) + 1}`;
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as ContentTree; if (object.title || object.label) return String(object.title || object.label); }
  const key = path.split('.').at(-1)!; return fieldLabels[key] ?? 'Propiedades';
}
export function selectedContentControls(path: string, read: (path: string) => unknown) {
  const node = contentElement('div'); node.className = 'content-properties';
  const parent = contentParent(path);
  if (parent) {
    const button = contentElement('button', 'Editar bloque completo'); button.type = 'button'; button.dataset.contentSelect = parent; node.append(button);
  }
  const source = contentSource(path);
  if (source) {
    const link = contentElement('a', source.action); link.href = source.href;
    if (/^source\.products(?:\.\d+)?$/.test(path)) {
      node.append(contentElement('p', 'El diseño se aplica a todas las tarjetas y se guarda en este borrador.'));
      node.append(selectedContentControls('blocks.listing.cards', read));
      node.append(contentElement('p', source.description), link);
      return node;
    }
    node.append(contentElement('p', source.description), link, contentElement('p', 'Estos cambios se guardan desde su módulo. Tu borrador de contenido se conserva al cambiar de sección.'));
    if (path === 'source.about') node.append(contentControls(read('copy.home.aboutAlt'), 'copy.home.aboutAlt', fieldLabels.aboutAlt, read));
    return node;
  }
  const group = Object.hasOwn(contentGroups, path) ? contentGroups[path] : undefined;
  if (!group) node.append(contentControls(read(path), path, selectionLabel(path, read(path)), read));
  else for (const key of group.fields) node.append(contentControls(read(key), key, fieldLabels[key.split('.').at(-1)!], read));
  return node;
}
export function contentControls(value: unknown, path: string, name: string, read: (path: string) => unknown, level = 0): HTMLElement {
  const el = contentElement, key = path.split('.').at(-1)!;
  if (Array.isArray(value)) {
    const group = el('details'); group.open = level < 2; group.className = 'content-block'; group.append(el('summary', `${name} (${value.length})`));
    value.forEach((item, index) => {
      const row = el('div'); row.className = 'content-item'; row.append(contentControls(item, `${path}.${index}`, `${name} ${index + 1}`, read, level + 1));
      const actions = el('div'); actions.className = 'content-actions';
      for (const [action, title] of [['up', 'Subir'], ['down', 'Bajar'], ['duplicate', 'Duplicar'], ['remove', 'Quitar']]) {
        const button = el('button', title); button.type = 'button'; button.dataset.contentAction = action; button.dataset.path = path; button.dataset.index = String(index);
        button.disabled = action === 'up' && index === 0 || action === 'down' && index === value.length - 1 || action === 'duplicate' && value.length >= (key === 'columns' ? 4 : 40); actions.append(button);
      }
      row.append(actions); group.append(row);
    });
    const add = el('button', `Agregar ${name.toLowerCase()}`); add.type = 'button'; add.dataset.contentAction = 'add'; add.dataset.path = path;
    add.disabled = value.length >= (key === 'columns' ? 4 : 40); group.append(add); return group;
  }
  if (value !== null && typeof value === 'object') {
    const group = el('div'); group.className = 'content-properties';
    for (const [field, child] of Object.entries(value)) {
      if (['about', 'legal', 'contact'].includes(field) && path.startsWith('pages.')) continue;
      if (level === 0 && (path === 'footer' && ['benefits', 'columns'].includes(field) || /^pages\.[^.]+$/.test(path) && field === 'sections')) continue;
      group.append(contentControls(child, `${path}.${field}`, fieldLabels[field] ?? field, read, level + 1));
    }
    if (/^pages\.[^.]+$/.test(path)) group.append(el('p', 'Desactivar esta página bloquea su URL y retira sus enlaces al publicar. Su contenido se conserva.'));
    return group;
  }
  const label = el('label', name); label.className = 'content-field';
  if (typeof value === 'boolean') {
    const input = el('input'); input.type = 'checkbox'; input.checked = value; input.dataset.contentPath = path; label.prepend(input); label.classList.add('content-checkbox'); return label;
  }
  const choices = path === 'listing.columns' ? ['2', '3', '4'] : path === 'listing.pageSize' ? ['12', '24', '36', '48'] : undefined;
  if (choices) {
    const input = el('select'); input.dataset.contentPath = path;
    for (const value of choices) { const option = el('option', value); option.value = value; input.append(option); }
    input.value = String(value); label.append(input); return label;
  }
  if (key === 'target' || key === 'icon') {
    const input = el('select'); input.dataset.contentPath = path;
    const icons: ContentTree = { box: 'Caja', truck: 'Camión', chat: 'Conversación', star: 'Estrella', shield: 'Escudo' };
    for (const option of key === 'target' ? editorTargets : Object.keys(icons)) { const node = el('option', fieldLabels[option] ?? String(icons[option])); node.value = option; input.append(node); }
    input.value = String(value); label.append(input);
    if (key === 'target') {
      const target = String(value), targetPath = ['catalog', 'cart'].includes(target) ? `features.${target}` : `pages.${target}.enabled`;
      const wrapper = el('div'); wrapper.append(label, contentControls(read(targetPath), targetPath, `Activar ${fieldLabels[target] ?? target} y su ruta`, read, level + 1)); return wrapper;
    }
    return label;
  }
  const input = el('textarea'); input.rows = typeof value === 'string' && value.length > 140 ? 5 : 2; input.maxLength = 6000;
  input.value = String(value ?? ''); input.dataset.contentPath = path; label.append(input);
  if (path.startsWith('contact.')) {
    const inherit = el('label', 'Usar configuración inicial del servidor'); inherit.className = 'content-checkbox';
    const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = value === null; checkbox.dataset.contentInherit = path; input.disabled = value === null; inherit.prepend(checkbox);
    const wrapper = el('div'); wrapper.append(label, inherit); return wrapper;
  }
  return label;
}
