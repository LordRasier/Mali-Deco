import '../../orders.css';
import { apiRequest, ApiError } from '../../api';
import type { sessionStore } from '../../session-store';
import { readAdminSection } from '../admin-fragment';
import { createOrdersReader } from './orders-reader';

export function mountOrders(root: HTMLElement, session: typeof sessionStore) {
  let active = true, dirty = false, filterDirty = false, writing = false, reading = false, background = false;
  const error = (text: string) => {
    const message = root.querySelector<HTMLElement>('[data-orders-error]');
    if (message) { message.textContent = text; message.hidden = !text; }
  };
  const success = (text: string) => {
    const message = root.querySelector<HTMLElement>('[data-orders-success]');
    if (message) { message.textContent = text; message.hidden = !text; }
  };
  const currentQuery = (detail = true) => {
    const query = new URLSearchParams(root.dataset.orderFilters ?? '');
    query.set('page', root.dataset.ordersPage ?? '1');
    if (detail && root.dataset.orderCurrent) { query.set('view', 'detail'); query.set('id', root.dataset.orderCurrent); }
    return query;
  };
  const reader = createOrdersReader({
    busy: value => { reading = value; root.setAttribute('aria-busy', String(value || writing)); },
    error: text => {
      error(text);
      const retry = root.querySelector<HTMLElement>('[data-orders-retry]');
      if (retry) retry.hidden = !text;
    },
    show: html => {
      if (background && (dirty || filterDirty || (root.ownerDocument.activeElement !== root && root.contains(root.ownerDocument.activeElement)))) return;
      const section = readAdminSection(root.ownerDocument, 'orders', html);
      root.className = section.className;
      root.replaceChildren(...Array.from(section.childNodes));
      root.dataset.ordersPage = section.dataset.ordersPage;
      root.dataset.orderFilters = section.dataset.orderFilters ?? '';
      root.dataset.orderCurrent = section.dataset.orderCurrent ?? '';
      dirty = false; filterDirty = false;
      if (!background) { root.tabIndex = -1; root.focus(); }
    },
  }, session);
  async function read(query: URLSearchParams, automatic = false) {
    if (writing || reading) return;
    background = automatic;
    await reader.read(query);
  }
  const changed = (event: Event) => {
    const el = event.target as Element;
    if (el.closest('[data-orders-filters]')) filterDirty = true;
    const edit = root.querySelector<HTMLFormElement>('[data-order-edit]');
    if (!edit || (!el.closest('[data-order-edit]') && (el as HTMLInputElement).form !== edit)) return;
    dirty = true;
    for (const hint of root.querySelectorAll<HTMLElement>('[data-order-dirty]')) { hint.textContent = 'Tenés cambios sin guardar'; hint.dataset.dirty = 'true'; }
    const saveBar = root.querySelector<HTMLElement>('[data-order-save-bar]');
    if (saveBar) saveBar.hidden = false;
    root.querySelectorAll<HTMLButtonElement>('[data-order-save]').forEach(button => { button.disabled = false; });
    success('');
  };
  const click = (event: Event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-order-id],[data-order-page],[data-orders-retry],[data-orders-refresh],[data-orders-clear],[data-order-discard]');
    if (!target || !root.contains(target) || writing || reading) return;
    event.preventDefault();
    if (target.hasAttribute('data-order-discard')) { dirty = false; void read(currentQuery()); return; }
    if (dirty) { error('Guardá los cambios o elegí "Descartar" antes de actualizar o salir del pedido.'); return; }
    if (target.hasAttribute('data-orders-retry') || target.hasAttribute('data-orders-refresh')) { void read(currentQuery()); return; }
    if (target.hasAttribute('data-orders-clear')) { void read(new URLSearchParams({ page: '1' })); return; }
    const query = currentQuery(false);
    query.set('page', target.dataset.orderPage || root.dataset.ordersPage || '1');
    if (target.dataset.orderId) { query.set('view', 'detail'); query.set('id', target.dataset.orderId); }
    void read(query);
  };
  async function submit(event: Event) {
    const form = event.target as HTMLFormElement;
    if (!form.matches('[data-orders-filters],[data-order-edit],[data-order-upload]')) return;
    event.preventDefault();
    if (writing || reading || !form.reportValidity()) return;
    const data = new FormData(form);
    if (form.matches('[data-orders-filters]')) {
      const query = new URLSearchParams({ page: '1' });
      for (const [key, value] of data.entries()) if (typeof value === 'string' && value.trim()) query.set(key, value.trim());
      await read(query); return;
    }
    const upload = form.matches('[data-order-upload]');
    if (upload && dirty) { error('Guardá o descartá los cambios del pedido antes de adjuntar el archivo.'); return; }
    const csrf = session.getSnapshot().csrf;
    if (!csrf) { error('La sesión no está lista. Volvé a iniciar sesión.'); return; }
    let body: unknown = data;
    if (upload) {
      const file = data.get('file');
      if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) { error('Elegí un PDF, JPG o PNG de hasta 2 MB.'); return; }
    } else {
      body = { ...Object.fromEntries(data.entries()), revision: Number(form.dataset.revision), paymentStatus: data.get('paymentStatus') ?? form.dataset.payment };
    }
    const epoch = session.getEpoch(), controls = Array.from(root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input,button,select,textarea')).filter(control => !control.disabled);
    writing = true; error(''); success(''); root.setAttribute('aria-busy', 'true');
    controls.forEach(control => { control.disabled = true; });
    try {
      await apiRequest('/admin/orders/' + encodeURIComponent(form.dataset.id!) + (upload ? '/attachments' : ''), { method: upload ? 'POST' : 'PUT', body, csrf });
      if (!active || epoch !== session.getEpoch()) return;
      dirty = false; writing = false;
      await read(currentQuery());
      success(upload ? 'Comprobante adjuntado correctamente.' : 'Cambios guardados. El historial quedó actualizado.');
    } catch (failure) {
      if (!active || epoch !== session.getEpoch()) return;
      error(failure instanceof ApiError && failure.status === 409 ? 'El pedido cambió o el pago lo gestiona Mercado Pago. Conservamos tus cambios: revisá los datos con "Descartar" antes de volver a guardar.'
        : failure instanceof ApiError && failure.status === 400 ? 'Revisá los datos: para despachar se requiere pago aprobado y preparación completa; para completar, entrega confirmada. El seguimiento debe usar https://.'
        : failure instanceof Error ? failure.message : 'No se pudo guardar el pedido.');
    } finally {
      writing = false;
      if (active) { controls.forEach(control => { control.disabled = false; }); root.setAttribute('aria-busy', String(reading)); }
    }
  }
  const timer = setInterval(() => {
    if (!active || writing || reading || dirty || filterDirty || root.ownerDocument.hidden || !root.getClientRects().length || (root.ownerDocument.activeElement !== root && root.contains(root.ownerDocument.activeElement))) return;
    void read(currentQuery(), true);
  }, 30000);
  const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  root.addEventListener('click', click); root.addEventListener('input', changed); root.addEventListener('change', changed); root.addEventListener('submit', submit);
  root.ownerDocument.defaultView?.addEventListener('beforeunload', beforeUnload);
  return () => { active = false; clearInterval(timer); reader.dispose(); root.removeEventListener('click', click); root.removeEventListener('input', changed); root.removeEventListener('change', changed); root.removeEventListener('submit', submit); root.ownerDocument.defaultView?.removeEventListener('beforeunload', beforeUnload); };
}
