import { apiRequest } from '../api';
import type { sessionStore } from '../session-store';
import type { TaxonomyItem, TaxonomyKind } from '../types';
import { loadTaxonomy } from './taxonomy-options';

type Selectors = { kind: TaxonomyKind; select: string; message: string; button: string };
/** Native product/variant options share complete snapshots and preserve the exact selected value on refresh failure. */
export function mountTaxonomySelect(root: HTMLElement, session: typeof sessionStore,
  disabled: (control: HTMLSelectElement | HTMLButtonElement, value: boolean) => void, selectors: Selectors,
  load: (signal: AbortSignal) => Promise<TaxonomyItem[]> = signal => loadTaxonomy(selectors.kind, apiRequest, signal)) {
  const select = root.querySelector<HTMLSelectElement>(selectors.select), message = root.querySelector<HTMLElement>(selectors.message);
  const button = root.querySelector<HTMLButtonElement>(selectors.button);
  let active = true, request: AbortController | undefined; const epoch = session.getEpoch();
  async function refresh() {
    if (!active || !select || !message || !button) return;
    request?.abort(); const controller = new AbortController(); request = controller;
    const current = () => active && session.getEpoch() === epoch && request === controller && !controller.signal.aborted;
    disabled(select, true); disabled(button, true); message.textContent = 'Cargando opciones…'; message.setAttribute('role', 'status');
    try {
      const items = await load(controller.signal); if (!current()) return;
      const selected = select.value;
      const option = (value: string, text: string) => { const node = root.ownerDocument.createElement('option'); node.value = value; node.textContent = text; return node; };
      select.replaceChildren(option('', 'Sin asignar'));
      if (selected && !items.some(item => item.id === selected)) select.append(option(selected, 'Asignación actual no disponible'));
      for (const item of items) select.append(option(item.id, item.name));
      select.value = selected; disabled(select, false); message.textContent = items.length || selected ? '' : 'Todavía no hay opciones. Puede crear una aquí.';
    } catch (failure) {
      if (!current()) return;
      message.textContent = `${failure instanceof Error ? failure.message : 'No se pudieron cargar las opciones.'} La asignación actual se conservará.`;
      message.setAttribute('role', 'alert');
    } finally { if (current()) disabled(button, false); }
  }
  void refresh();
  return { refresh: () => { void refresh(); }, dispose: () => { active = false; request?.abort(); } };
}
