import { ApiError } from '../../api';
import type { sessionStore } from '../../session-store';
import { canManageCatalog } from '../../session-core';
import { minorToDecimal } from '../../money';
import { readAdminSection } from '../admin-fragment';
import type { AdminProductsRuntime, ProductMutationLease, AdminProductRoute } from './product-controller';
import { adjustmentReceipt, quickAdjustment, quickVariants, type QuickVariant } from './product-quick-edit-data';

type Field = { variant: QuickVariant; form: HTMLFormElement; price: HTMLInputElement; stock?: HTMLInputElement;
  save: HTMLButtonElement; note: HTMLElement; review: boolean };
type Panel = { id: string; button: HTMLButtonElement; row: HTMLElement; content: HTMLElement; notice: HTMLElement;
  fields: Field[]; page: number; loaded: boolean; loading: boolean; version: number };
type Owner = { reserve(): ProductMutationLease | null; busy(value: boolean): void; route(): AdminProductRoute };

/** Retained subrows own their drafts; saving one variant never replaces neighboring forms. */
export function mountProductQuickEdit(root: HTMLElement, session: typeof sessionStore, runtime: AdminProductsRuntime, owner: Owner) {
  let active = true, writing = false;
  const epoch = session.getEpoch(), panels = new Map<string, Panel>();
  const current = () => active && session.getEpoch() === epoch && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const element = root.ownerDocument.createElement(tag); element.textContent = text; if (className) element.className = className; return element;
  };
  const button = (text: string, action: () => void) => { const item = node('button', text, 'text-button btn-sm'); item.type = 'button'; item.addEventListener('click', action); return item; };
  const recovery = (panel: Panel, field: Field) => { field.note.append(button('Recargar valores', () => { void load(panel, panel.page, true); })); };
  const pending = (field: Field) => {
    try { return !!quickAdjustment(field.variant, field.price.value, field.stock?.value ?? ''); } catch { return true; }
  };
  const dirty = (panel: Panel) => panel.fields.some(pending);
  const update = (field: Field) => { field.save.disabled = writing || field.review || !pending(field); };
  const input = (label: string, value: string, name: string, form: HTMLFormElement) => {
    const wrapper = node('label', label), control = node('input', '', 'form-control-sm'); control.name = name; control.value = value; control.required = true;
    wrapper.append(control); form.append(wrapper); return control;
  };
  async function refreshSummary(panel: Panel) {
    const route = owner.route(); if (route.view !== 'list') return;
    const html = await runtime.read(route, new AbortController().signal);
    if (!current()) return;
    const next = readAdminSection(root.ownerDocument, 'products', html);
    const row = [...next.querySelectorAll<HTMLElement>('[data-product-row]')].find(row => row.dataset.productRow === panel.id);
    const previous = panel.row.previousElementSibling;
    if (!row || !previous) throw Error('No se pudo actualizar el resumen.');
    for (const key of ['stock', 'price']) {
      const source = row.querySelector(`[data-product-summary="${key}"]`), target = previous.querySelector(`[data-product-summary="${key}"]`);
      if (!source || !target) throw Error('No se pudo actualizar el resumen.');
      target.replaceChildren(...Array.from(source.childNodes));
    }
  }
  async function save(panel: Panel, field: Field) {
    if (!current() || writing || field.review) return;
    let body: ReturnType<typeof quickAdjustment>;
    try { body = quickAdjustment(field.variant, field.price.value, field.stock?.value ?? ''); }
    catch (error) { field.note.textContent = error instanceof Error ? error.message : 'Revisá los valores.'; return; }
    const csrf = session.getSnapshot().csrf; if (!body || !csrf) return;
    const lease = owner.reserve(); if (!lease) return;
    const accepts = () => current() && lease.current();
    writing = true; owner.busy(true); field.note.textContent = 'Guardando…';
    try {
      if (!accepts()) return;
      const result = await runtime.request(`/admin/catalog/products/${encodeURIComponent(panel.id)}/variants/${encodeURIComponent(field.variant.id)}/quick-adjustment`, { method: 'PUT', body, csrf });
      if (!accepts()) return;
      field.variant = adjustmentReceipt(result, field.variant, body);
      field.price.value = minorToDecimal(field.variant.priceMinor, field.variant.currency).replace('.', ',');
      if (field.stock) field.stock.value = String(field.variant.stockQuantity);
      field.note.textContent = 'Cambios guardados.';
      try { await refreshSummary(panel); }
      catch { if (accepts()) { field.note.textContent = 'Cambios guardados. No se pudo refrescar el resumen.'; recovery(panel, field); } }
    } catch (error) {
      if (!accepts()) return;
      if (error instanceof ApiError && error.status === 401) { session.expire(); return; }
      field.review = !(error instanceof ApiError) || error.status === 409 || error.status === 0 || error.status >= 500;
      field.note.textContent = error instanceof ApiError && error.status === 409
        ? 'El precio o el stock cambió. Actualizá los valores antes de guardar.'
        : error instanceof Error ? error.message : 'No se pudo confirmar el guardado. Actualizá los valores.';
      if (field.review) recovery(panel, field);
    } finally {
      if (accepts()) { writing = false; owner.busy(false); for (const panel of panels.values()) panel.fields.forEach(update); }
      lease.release();
    }
  }
  function render(panel: Panel, variants: QuickVariant[], total: number) {
    const header = node('div', '', 'product-quick-heading'), title = node('div');
    title.append(node('strong', 'Ajuste rápido'), node('small', 'Guardá el precio y el stock de cada variante.'));
    header.append(title);
    panel.fields = []; panel.content.replaceChildren(header);
    for (const variant of variants) {
      const form = node('form', '', 'product-quick-form'); form.setAttribute('aria-label', 'Ajustar ' + variant.name); form.dataset.quickForm = '';
      const identity = node('div', '', 'product-quick-variant'); identity.append(node('strong', variant.name), node('small', 'SKU: ' + variant.sku)); form.append(identity);
      const price = input('Precio · ' + variant.currency, minorToDecimal(variant.priceMinor, variant.currency).replace('.', ','), 'quickPrice', form); price.inputMode = 'decimal'; price.maxLength = 32;
      let stock: HTMLInputElement | undefined;
      if (variant.supplyMode === 'stock') { stock = input('Stock disponible', String(variant.stockQuantity), 'quickStock', form); stock.type = 'number'; stock.min = '0'; stock.max = '1000000'; stock.step = '1'; stock.inputMode = 'numeric'; }
      else { const availability = node('div', '', 'product-quick-availability'); availability.append(node('span', 'Disponibilidad'), node('strong', variant.supplyMode === 'made_to_order' ? 'A pedido · sin límite' : 'Sin definir')); form.append(availability); }
      const submit = node('button', 'Guardar', 'primary btn-sm'); submit.type = 'submit'; submit.disabled = true; submit.setAttribute('aria-label', 'Guardar ajustes de ' + variant.name);
      const note = node('p', '', 'product-quick-feedback'); note.setAttribute('role', 'status');
      const field: Field = { variant, form, price, stock, save: submit, note, review: false }; panel.fields.push(field);
      form.append(submit, note); form.addEventListener('input', () => { update(field); if (!field.review) note.textContent = pending(field) ? 'Cambios sin guardar.' : ''; });
      form.addEventListener('submit', event => { event.preventDefault(); void save(panel, field); }); panel.content.append(form);
    }
    if (!variants.length) panel.content.append(node('p', 'No hay variantes vigentes en esta página. Podés agregarlas desde la ficha del producto.'));
    const pages = Math.max(1, Math.ceil(total / 24));
    if (pages > 1) {
      const nav = node('nav', '', 'product-quick-pagination'); nav.setAttribute('aria-label', 'Páginas de variantes');
      const previous = button('Anteriores', () => { void load(panel, panel.page - 1); }), next = button('Siguientes', () => { void load(panel, panel.page + 1); });
      previous.disabled = panel.page <= 1; next.disabled = panel.page >= pages || panel.page >= 10000;
      nav.append(node('span', `Variantes · Página ${panel.page} de ${pages}`), previous, next); panel.content.append(nav);
    }
  }
  async function load(panel: Panel, page: number, refresh = false) {
    if (!current() || writing || panel.loading || (dirty(panel) && !window.confirm('¿Descartar los ajustes sin guardar y cargar los valores actuales?'))) return;
    const version = ++panel.version; panel.loading = true; panel.notice.textContent = 'Cargando variantes…'; panel.content.hidden = true;
    try {
      const result = await runtime.request(`/admin/catalog/products/${encodeURIComponent(panel.id)}?page=${page}&limit=24`);
      if (!current() || version !== panel.version) return;
      const data = quickVariants(result, panel.id, page); panel.page = page; render(panel, data.variants, data.total); panel.loaded = true; panel.notice.textContent = '';
      if (refresh) try { await refreshSummary(panel); } catch { if (current()) panel.notice.textContent = 'Valores actualizados. No se pudo refrescar el resumen del producto.'; }
    } catch (error) {
      if (!current() || version !== panel.version) return;
      if (error instanceof ApiError && error.status === 401) { session.expire(); return; }
      panel.notice.textContent = error instanceof Error ? error.message : 'No se pudieron cargar las variantes.';
      if (!panel.loaded) { panel.content.replaceChildren(button('Reintentar lectura', () => { void load(panel, page); })); }
    } finally { if (current() && version === panel.version) { panel.loading = false; panel.content.hidden = false; } }
  }
  const click = (event: Event) => {
    const toggle = (event.target as Element).closest<HTMLButtonElement>('[data-quick-toggle]');
    if (!toggle || !current() || writing) return;
    const id = toggle.dataset.quickToggle!;
    let panel = panels.get(id);
    if (!panel) {
      const row = toggle.closest('tr')?.nextElementSibling as HTMLElement | null, content = row?.querySelector<HTMLElement>('[data-quick-content]'), notice = row?.querySelector<HTMLElement>('[data-quick-notice]');
      if (!row || row.dataset.quickRow !== id || !content || !notice) return;
      panel = { id, button: toggle, row, content, notice, fields: [], page: 1, loaded: false, loading: false, version: 0 }; panels.set(id, panel);
    }
    panel.row.hidden = !panel.row.hidden; toggle.setAttribute('aria-expanded', String(!panel.row.hidden));
    if (!panel.row.hidden && !panel.loaded) void load(panel, 1);
  };
  root.addEventListener('click', click);
  return { pending: () => writing || [...panels.values()].some(panel => dirty(panel) || panel.fields.some(field => field.review)),
    dispose() { active = false; root.removeEventListener('click', click); panels.clear(); } };
}
