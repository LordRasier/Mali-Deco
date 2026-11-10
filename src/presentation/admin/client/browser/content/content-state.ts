import { emptyContentItems } from './content-fields';

export type ContentTree = Record<string, unknown>;
export type EditorSnapshot = { settings: ContentTree; revision: number; publishedRevision: number; available: boolean; hasDraft: boolean; stale: boolean };
export function contentAt(tree: ContentTree, path: string): unknown {
  let value: unknown = tree;
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = (value as ContentTree)[key];
  }
  return value;
}

export class ContentHistory {
  value: ContentTree = {};
  private past: ContentTree[] = [];
  private future: ContentTree[] = [];
  private saved = '{}';
  private lastEdit = '';
  private lastTime = 0;
  get dirty() { return JSON.stringify(this.value) !== this.saved; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  load(value: ContentTree) { this.value = structuredClone(value); this.saved = JSON.stringify(value); this.past = []; this.future = []; this.lastEdit = ''; }
  markSaved(value: ContentTree) { this.value = structuredClone(value); this.saved = JSON.stringify(value); this.lastEdit = ''; }
  edit(change: (draft: ContentTree) => void, key = '') {
    const next = structuredClone(this.value); change(next);
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    const now = Date.now();
    if (!key || this.lastEdit !== key || now - this.lastTime > 750) { this.past.push(this.value); if (this.past.length > 50) this.past.shift(); }
    this.value = next; this.future = []; this.lastEdit = key; this.lastTime = now;
  }
  set(path: string, value: unknown) {
    this.edit(draft => {
      const parts = path.split('.'), key = parts.pop()!, parent = parts.length ? contentAt(draft, parts.join('.')) : draft;
      if (contentAt(draft, path) === undefined || !parent || typeof parent !== 'object') throw Error('El campo ya no existe.');
      (parent as ContentTree)[key] = value;
    }, path);
  }
  undo() { const value = this.past.pop(); if (value) { this.future.push(this.value); this.value = value; this.lastEdit = ''; } }
  redo() { const value = this.future.pop(); if (value) { this.past.push(this.value); this.value = value; this.lastEdit = ''; } }
  move(path: string, from: number, to: number) {
    this.edit(draft => {
      const list = contentAt(draft, path);
      if (!Array.isArray(list) || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
      const [item] = list.splice(from, 1); list.splice(to, 0, item);
    });
  }
  item(path: string, action: 'add' | 'remove' | 'duplicate', index = -1) {
    this.edit(draft => {
      const list = contentAt(draft, path), key = path.split('.').at(-1)!;
      if (!Array.isArray(list)) return;
      if (action === 'remove') { if (index >= 0 && index < list.length) list.splice(index, 1); return; }
      if (list.length >= (key === 'columns' ? 4 : 40)) throw Error('Alcanzaste el máximo de elementos de este grupo.');
      const template = key === 'links' && path.startsWith('footer.') ? { target: 'contacto', label: 'Nuevo enlace' } : emptyContentItems[key];
      const item = structuredClone(action === 'duplicate' ? list[index] : template);
      if (item === undefined) return;
      if (key === 'sections') { let n = list.length + 1; while (list.some(s => s.id === `seccion-${n}`)) n++; item.id = `seccion-${n}`; }
      list.splice(action === 'duplicate' ? index + 1 : list.length, 0, item);
    });
  }
}
