import { catalogQueryParams, minorToDisplayPrice, parseCatalogQuery, type CatalogQuery } from '../../../shared/catalog/catalog-query';
import { applyCatalogPrices, changeCatalogCurrency, clearCatalogFilters, toggleCatalogFilter, type FilterGroup } from '../../../shared/catalog/catalog-filters';

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing catalog control: ${selector}`);
  return element;
}

/** Native navigation keeps SSR authoritative; only mobile edits remain an uncommitted draft. */
export function mountCatalogFilters() {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>('[data-filter-form]'));
  if (!forms.length) return () => {};
  const context = required<HTMLElement>(document, '[data-filter-query][data-filter-action]');
  // SSR includes the category from a pretty URL and the store's default currency.
  const parsed = parseCatalogQuery(new URLSearchParams(context.dataset.filterQuery));
  const path = context.dataset.filterAction;
  if (parsed.error || path !== '/catalogo' || !/^\/(?:catalogo|categorias\/[a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.test(window.location.pathname)) throw new Error('Invalid catalog filter context');
  const applied = parsed.query;
  const dialog = required<HTMLDialogElement>(document, '[data-filter-dialog]');
  const open = required<HTMLButtonElement>(document, '[data-filter-open]');
  const close = required<HTMLButtonElement>(dialog, '[data-filter-close]');
  const cleanups: Array<() => void> = [], resets: Array<() => void> = [];
  const listen = (node: EventTarget, event: string, handler: EventListener) => {
    node.addEventListener(event, handler); cleanups.push(() => node.removeEventListener(event, handler));
  };
  const navigate = (query: CatalogQuery) => {
    const params = catalogQueryParams({ ...query, page: 1 });
    if (parseCatalogQuery(params).error) throw new Error('Revisá los filtros antes de continuar.');
    window.location.assign(path + (params.size ? `?${params}` : ''));
  };
  for (const form of forms) {
    const mobile = form.dataset.filterForm === 'mobile';
    const fields = required<HTMLFieldSetElement>(form, '[data-filter-fields]');
    const currency = required<HTMLSelectElement>(form, '[data-filter-currency]');
    const min = required<HTMLInputElement>(form, '[data-filter-min]'), max = required<HTMLInputElement>(form, '[data-filter-max]');
    const error = required<HTMLElement>(form, '[data-filter-error]');
    const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('[data-filter-group]'));
    let draft = structuredClone(applied);
    const render = () => {
      currency.value = draft.currency; min.disabled = max.disabled = !draft.currency;
      for (const box of boxes) {
        const group = box.dataset.filterGroup as FilterGroup;
        box.checked = draft[group].includes(box.value); box.disabled = !box.checked && draft[group].length >= 20;
      }
    };
    const reset = () => {
      draft = structuredClone(applied); min.value = minorToDisplayPrice(draft.minPriceMinor, draft.currency);
      max.value = minorToDisplayPrice(draft.maxPriceMinor, draft.currency); error.hidden = true; render();
    };
    resets.push(reset);
    const attempt = (action: () => void) => {
      try { error.hidden = true; action(); }
      catch (reason) { error.textContent = reason instanceof Error ? reason.message : 'Revisá los filtros.'; error.hidden = false; }
    };
    for (const box of boxes) listen(box, 'change', () => attempt(() => {
      draft = toggleCatalogFilter(draft, box.dataset.filterGroup as FilterGroup, box.value); render();
      if (!mobile) navigate(draft);
    }));
    listen(currency, 'change', () => attempt(() => {
      draft = changeCatalogCurrency(draft, currency.value); min.value = max.value = ''; render();
      if (!mobile) navigate(draft);
    }));
    listen(form, 'submit', event => {
      event.preventDefault(); attempt(() => navigate(applyCatalogPrices(draft, min.value, max.value)));
    });
    listen(required(form, '[data-filter-clear]'), 'click', () => attempt(() => {
      draft = clearCatalogFilters(draft); min.value = max.value = '';
      if (!Array.from(currency.options).some(option => option.value === draft.currency && option.hasAttribute('data-available'))) draft.currency = '';
      render(); if (!mobile) navigate(draft);
    }));
    if (mobile) listen(required(form, '[data-filter-cancel]'), 'click', () => dialog.close());
    reset(); fields.disabled = false;
  }
  const resetAll = () => { for (const reset of resets) reset(); };
  listen(open, 'click', () => { resetAll(); dialog.showModal(); close.focus(); });
  listen(close, 'click', () => dialog.close());
  listen(dialog, 'close', resetAll);
  listen(dialog, 'keydown', event => {
    if ((event as KeyboardEvent).key === 'Escape' && dialog.open) { event.preventDefault(); dialog.close(); }
  });
  listen(window, 'pageshow', () => { if (dialog.open) dialog.close(); resetAll(); });
  open.disabled = false;
  return () => { for (const cleanup of cleanups) cleanup(); };
}
