import { apiRequest } from '../../api';
import type { sessionStore } from '../../session-store';
import type { TaxonomyItem, TaxonomyKind } from '../../types';
import { readAdminSection } from '../admin-fragment';
import { createAdminProducts, type AdminProductRoute, type AdminProductsRuntime, type AdminProductsView } from './product-controller';
import { productFormInput } from './product-form';
import { fetchAdminProduct, productRoute } from './product-runtime';
import { mountProductCategories } from './product-categories';
import { mountTaxonomySelect } from '../taxonomy-select';
import { createVariantEditor } from './variant-editor';
import { variantFormInput } from './variant-form';
import { currencyFractionDigits } from '../../money';
import { createProductMedia } from './product-media';
import { mountNewProductPhotos } from './new-product-photos';
import { createClassification, refreshCoverPreview, suggestedSlug, toggleClassification } from './editor-tools';
import { loadInlineVariant } from './inline-variant';
import { variantInput } from '../../form-validation';
import { stockInput } from './inventory-form';
import { mountProductQuickEdit } from './product-quick-edit';
import { mountProductPricing } from './product-pricing';
import { readPricing } from './pricing-fields';
import { mountVariantOptions, readVariantOptions } from './variant-options';
import { mountVariantImages } from './variant-images';
import { mountVariantDrawer } from './variant-drawer';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | HTMLSelectElement;
function field(form: HTMLFormElement, name: string, optional = false): string {
  const control = form.elements.namedItem(name);
  if (!control && optional) return '';
  if (!control || !('value' in control) || typeof control.value !== 'string') throw new Error('El formulario no está completo.');
  if (name === 'featured' && 'checked' in control) return String(control.checked);
  return control.value;
}

/** Bind one retained server section; successful reads replace its content, never the surrounding workspace. */
export function mountAdminProducts(root: HTMLElement, session: typeof sessionStore,
  options: { runtime?: AdminProductsRuntime; loadCategories?: (signal: AbortSignal) => Promise<TaxonomyItem[]> } = {}) {
  const initial = productRoute(root.dataset), previousDisabled = new Map<Control, boolean>();
  let busy = false, loading = false, categoryChanged = false;
  let dirty = false, simpleDirty = false, variantDirty = false, slugEdited = false;
  const stockDrafts = new Set<HTMLFormElement>();
  let inlineRead: AbortController | undefined;
  let quickEdit: ReturnType<typeof mountProductQuickEdit> | undefined;
  let pricing: ReturnType<typeof mountProductPricing> | undefined;
  let variantImages: ReturnType<typeof mountVariantImages> | undefined;
  let variantDrawer: ReturnType<typeof mountVariantDrawer> | undefined, variantReturnFocus: HTMLElement | undefined;
  let categories: ReturnType<typeof mountProductCategories> | undefined;
  let material: ReturnType<typeof mountTaxonomySelect> | undefined, color: ReturnType<typeof mountTaxonomySelect> | undefined;
  let variant: ReturnType<typeof createVariantEditor> | undefined, assignments = { material: false, color: false };
  const media = createProductMedia(session);
  let staged: ReturnType<typeof mountNewProductPhotos>;
  let handoff: { id: string; files: File[]; alts: string[] } | undefined;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const disabled = (control: Control, value: boolean) => {
    if (busy) { previousDisabled.set(control, value); control.disabled = true; } else control.disabled = value;
  };
  const progress = () => {
    root.setAttribute('aria-busy', String(busy || loading));
    const saved = get('[data-editor-save-state]');
    if (saved) {
      const pending = dirty || pricing?.pending(); saved.dataset.editorDirty = String(!!pending);
      saved.textContent = busy ? 'Guardando cambios…' : pending ? 'Cambios sin guardar' : root.dataset.productView === 'create' ? 'Producto sin guardar' : 'Información guardada';
    }
    const node = get('[data-product-loading]');
    if (node) { node.hidden = !busy && !loading; node.textContent = busy ? 'Guardando cambios…' : 'Cargando artículo…'; }
  };
  const clearFields = () => { inlineRead?.abort(); variantDrawer?.dispose(); variantDrawer = undefined; variantImages?.dispose(); variantImages = undefined; pricing?.dispose(); pricing = undefined; quickEdit?.dispose(); quickEdit = undefined; categories?.dispose(); material?.dispose(); color?.dispose(); variant?.dispose(); variant = undefined; };
  const bindVariantOptions = () => {
    material?.dispose(); color?.dispose(); assignments = { material: false, color: false };
    material = mountTaxonomySelect(root, session, disabled, { kind: 'materials', select: '[data-variant-material]', message: '[data-variant-material-message]', button: '[data-product-action="materials"]' });
    color = mountTaxonomySelect(root, session, disabled, { kind: 'colors', select: '[data-variant-color]', message: '[data-variant-color-message]', button: '[data-product-action="colors"]' });
  };
  const setupFields = () => {
    clearFields(); stockDrafts.clear(); dirty = simpleDirty = variantDirty = slugEdited = false;
    categories = mountProductCategories(root, session, disabled, options.loadCategories);
    bindVariantOptions();
    const route = productRoute(root.dataset), id = 'id' in route ? route.id : null;
    pricing = mountProductPricing(root, session, runtime, { reserve: controller.beginMutation, busy: view.busy, changed: progress,
      canCreate: () => !generalPending() && !galleryPending(), created: () => { if (id) void controller.navigate({ view: 'detail', id }); } });
    variantImages = mountVariantImages(root, session, runtime, { reserve: controller.beginMutation, busy: view.busy, allowed: () => !galleryPending() });
    if (route.view === 'list') quickEdit = mountProductQuickEdit(root, session, runtime, { reserve: controller.beginMutation, busy: view.busy, route: controller.route });
    staged?.dispose(); staged = route.view === 'create' ? mountNewProductPhotos(root) : undefined;
    if (!id || handoff?.id !== id || root.dataset.productArchived === 'true') handoff = undefined;
    const mounted = media.adopt(get('[data-product-media-slot]'), id, root.dataset.productArchived === 'true', handoff?.files, handoff?.alts);
    if (mounted) handoff = undefined;
    if (id) refreshCoverPreview(root, id);
    const pending = get('[data-product-media-pending]'); if (pending) pending.hidden = mounted;
    if (id) variant = createVariantEditor(session, { busy: view.busy, error: text => view.error(text, false), stockSaved: (variantId, quantity) => {
      for (const form of root.querySelectorAll<HTMLFormElement>('[data-stock-form]')) if (form.dataset.variantId === variantId) {
        form.dataset.expectedStock = String(quantity); stockDrafts.delete(form);
        const notice = form.querySelector<HTMLElement>('[data-stock-saved]'); if (notice) notice.textContent = 'Stock guardado.';
      }
    }, committed: () => {
      const page = 'page' in route ? route.page : undefined;
      view.committed({ productId: id, archived: false }); void controller.navigate({ view: 'detail', id, ...(page ? { page } : {}) });
    } }, id, root.dataset.productArchived === 'true', undefined, controller.beginMutation);
  };
  const view: AdminProductsView = {
    render(html, expected) {
      const next = readAdminSection(root.ownerDocument, 'products', html), route = productRoute(next.dataset);
      if (route.view !== expected.view || ('id' in expected && (!('id' in route) || route.id !== expected.id))
        || (expected.view === 'variant-edit' && (route.view !== 'variant-edit' || route.variantId !== expected.variantId))
        || ('id' in expected && 'id' in route && (route.page ?? 1) !== (expected.page ?? 1))
        || (expected.view === 'list' && (route.view !== 'list' || route.page !== expected.page || route.search !== expected.search.trim()
          || (route.status ?? 'all') !== (expected.status ?? 'all') || (route.sort ?? 'name_asc') !== (expected.sort ?? 'name_asc')))) throw new Error('La vista del artículo cambió. Intente nuevamente.');
      clearFields(); previousDisabled.clear();
      for (const key of ['productView', 'productId', 'productPage', 'productSearch', 'productStatusFilter', 'productSort', 'productArchived', 'productVariantId']) {
        if (next.dataset[key] === undefined) delete root.dataset[key]; else root.dataset[key] = next.dataset[key];
      }
      root.classList.toggle('product-editor', next.classList.contains('product-editor'));
      root.classList.toggle('product-list', next.classList.contains('product-list'));
      root.setAttribute('aria-label', next.getAttribute('aria-label') ?? 'Productos');
      root.replaceChildren(...Array.from(next.childNodes)); categoryChanged = false; setupFields(); progress();
    },
    loading(value) { loading = value; progress(); },
    busy(value) {
      if (value === busy) return;
      busy = value;
      if (busy) for (const control of Array.from(root.querySelectorAll<Control>('input, textarea, select, button'))) {
        if (control.closest('[data-product-media-slot]')) continue;
        previousDisabled.set(control, control.disabled); control.disabled = true;
      }
      else { for (const [control, wasDisabled] of previousDisabled) control.disabled = wasDisabled; previousDisabled.clear(); }
      progress();
    },
    error(message, retry) {
      const notice = get('[data-variant-drawer-message]') ?? get('[data-product-message]'); if (notice) { notice.textContent = message; notice.hidden = !message; if (message && !root.closest('[hidden]')) notice.focus?.(); }
      const button = get('[data-product-action="retry"]'); if (button) button.hidden = !retry;
    },
    informationSaved(product) {
      dirty = false; categoryChanged = false;
      progress();
      const heading = get('h1'), check = get('[data-check-name]'), message = get('[data-editor-saved]');
      if (heading) heading.textContent = product.name;
      if (check) check.textContent = 'Nombre guardado';
      if (message) message.textContent = 'Información guardada.';
    },
    committed(result) {
      if (staged?.hasFiles() && root.dataset.productView === 'create' && !result.archived) {
        handoff = { id: result.productId, files: staged.files(), alts: staged.alts() };
      }
      staged?.dispose(); staged = undefined;
      clearFields(); media.committed(result.productId, result.archived);
      const heading = root.ownerDocument.createElement('h1'); heading.textContent = handoff ? 'Producto guardado. Fotos pendientes de carga.' : 'Cambios guardados';
      const notice = root.ownerDocument.createElement('p'); notice.setAttribute('data-product-message', ''); notice.setAttribute('role', 'alert'); notice.hidden = true;
      const loading = root.ownerDocument.createElement('p'); loading.setAttribute('data-product-loading', ''); loading.setAttribute('role', 'status');
      const retry = root.ownerDocument.createElement('button'); retry.setAttribute('type', 'button'); retry.setAttribute('data-product-action', 'retry'); retry.textContent = 'Reintentar lectura'; retry.hidden = true;
      const back = root.ownerDocument.createElement('button'); back.setAttribute('type', 'button'); back.setAttribute('data-product-action', 'list'); back.textContent = 'Volver al catálogo';
      root.replaceChildren(heading, notice, loading, retry, back);
      const route = controller.route(); root.dataset.productView = route.view;
      if ('id' in route) root.dataset.productId = route.id;
    },
    focus() { const heading = get('h1'); if (heading && !root.closest('[hidden]')) { heading.setAttribute('tabindex', '-1'); heading.focus(); } },
  };
  const runtime: AdminProductsRuntime = options.runtime ?? { read: fetchAdminProduct, request: apiRequest,
    confirm: () => window.confirm('¿Archivar este artículo? Esta acción no se puede deshacer desde este panel.') };
  const controller = createAdminProducts(session, view, runtime, initial);
  const blocked = (condition: boolean, message: string) => { if (condition) view.error(message, false); return condition; };
  const updateInitialPrice = () => {
    if (root.dataset.productView !== 'create') return;
    const amount = get<HTMLInputElement>('[name="initialPrice"]')?.value.trim() ?? '';
    const supply = get<HTMLSelectElement>('[name="initialSupplyMode"]')?.value ?? '';
    const check = get('[data-check-price]'), preview = get('[data-preview-price]');
    let value: number | undefined;
    if (amount) try { value = variantInput({ sku: 'pending', name: 'Estándar', price: amount, currency: 'ARS', supplyMode: 'stock' }).priceMinor; } catch { /* Incomplete input remains editable. */ }
    if (check) check.textContent = value !== undefined && supply ? 'Precio indicado · sin guardar' : 'Falta un precio y disponibilidad';
    if (preview) preview.textContent = value === undefined ? 'Sin precio' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value / 100);
  };
  const generalPending = () => blocked(dirty, 'Guarde los cambios de información antes de continuar.');
  const otherPending = () => blocked(simpleDirty || variantDirty || stockDrafts.size > 0 || !!pricing?.pending(), 'Guarde el precio, stock o la variante antes de continuar.');
  const galleryPending = () => blocked(media.activity() !== 'clear', 'Hay fotos pendientes. Complete la carga o descarte los cambios de la galería antes de continuar.');
  const hasUnsaved = () => dirty || simpleDirty || variantDirty || stockDrafts.size > 0 || pricing?.pending() || variantImages?.pending() || quickEdit?.pending() || staged?.hasFiles() || !!handoff || media.activity() !== 'clear';
  const mayLeave = () => !blocked(media.activity() === 'writing', 'Espere a que termine la operación de la galería.') &&
    (!hasUnsaved() || window.confirm('¿Descartar los cambios sin guardar de esta ficha?'));
  const closeVariant = () => {
    variantDrawer?.dispose(); variantDrawer = undefined;
    get('[data-inline-variant-slot]')?.replaceChildren(); variantDirty = false; bindVariantOptions();
    const simple = get('[data-simple-form]'); if (simple) simple.hidden = false;
    (variantReturnFocus && root.contains(variantReturnFocus) ? variantReturnFocus : get('[data-product-action="variant-create"]'))?.focus();
    variantReturnFocus = undefined;
  };
  const openVariant = async (route: Extract<AdminProductRoute,{view:'detail'|'edit'|'variant-create'}>, id?: string, trigger?: HTMLElement) => {
    if (generalPending() || otherPending()) return;
    const lease = controller.beginMutation(); if (!lease) return;
    inlineRead?.abort(); const request = new AbortController(); inlineRead = request; view.busy(true);
    try {
      if (await loadInlineVariant(root, route, id, runtime.read, lease, request.signal)) {
        view.busy(false); bindVariantOptions();
        const simple = get('[data-simple-form]'); if (simple) simple.hidden = true;
        const form = get<HTMLFormElement>('[data-variant-form]');
        if (form) { variantReturnFocus = trigger; variantDrawer = mountVariantDrawer(form, { close: closeVariant, dirty: () => variantDirty, busy: () => busy,
          cancelLabel: get('.product-pricing')?.classList.contains('has-variants') ? 'Cancelar' : 'Volver a precio y stock' }); }
      }
    } catch (error) { if (lease.current()) view.error(error instanceof Error ? error.message : 'No se pudo cargar la variante.', false); }
    finally { if (lease.current()) view.busy(false); lease.release(); }
  };
  const submit = (event: Event) => {
    const form = event.target as HTMLFormElement;
    if (form.matches('[data-product-search-form]')) { event.preventDefault(); if (mayLeave()) void controller.list(1, field(form, 'search').trim(), { status: field(form, 'status', true), sort: field(form, 'sort', true) }); }
    else if (form.matches('[data-product-form]')) {
      event.preventDefault();
      try {
        const product = productFormInput(name => field(form, name, name === 'featured'), categoryChanged);
        const initialPricing = get('[data-initial-pricing]');
        if (root.dataset.productView === 'create' && initialPricing) {
          const hasPrice = ['initialCost', 'initialMarkup', 'initialPrice', 'initialDiscount', 'initialStock'].some(name => field(form, name, true).trim());
          const priceError = get('[data-initial-price-error]'); if (priceError) priceError.textContent = '';
          try { void controller.save(product, hasPrice ? readPricing(initialPricing, 'ARS') : undefined); }
          catch (error) { if (priceError) priceError.textContent = error instanceof Error ? error.message : 'Revisá el precio y el stock.'; }
          return;
        }
        const priceControl = form.elements.namedItem('initialPrice');
        if (root.dataset.productView === 'create' && priceControl && 'value' in priceControl) {
          const amount = String(priceControl.value).trim(), supply = field(form, 'initialSupplyMode') as ''|'stock'|'made_to_order';
          if (amount || supply) {
            const priceError = get('[data-initial-price-error]'), supplyError = get('[data-initial-supply-error]');
            const priceNode = get<HTMLInputElement>('[name="initialPrice"]'), supplyNode = get<HTMLSelectElement>('[name="initialSupplyMode"]');
            if (priceError) priceError.textContent = ''; if (supplyError) supplyError.textContent = '';
            priceNode?.removeAttribute('aria-invalid'); supplyNode?.removeAttribute('aria-invalid');
            let priceMinor: number;
            try { priceMinor = variantInput({ sku: 'pending', name: 'Estándar', price: amount, currency: 'ARS', supplyMode: 'stock' }).priceMinor; }
            catch (e) { if (priceError) priceError.textContent = e instanceof Error ? e.message : 'Revisá el precio.'; priceNode?.setAttribute('aria-invalid', 'true'); priceNode?.focus(); return; }
            if (!supply) { if (supplyError) supplyError.textContent = 'Elegí la disponibilidad.'; supplyNode?.setAttribute('aria-invalid', 'true'); supplyNode?.focus(); return; }
            const currency = 'ARS', supplyMode = supply;
            void controller.save(product, { priceMinor, currency, supplyMode });
          } else void controller.save(product);
        } else void controller.save(product);
      }
      catch (failure) { view.error(failure instanceof Error ? failure.message : 'Revise los datos del formulario.', false); }
    }
    else if (form.matches('[data-stock-form]')) {
      event.preventDefault();
      try { if (form.dataset.variantId) void variant?.saveStock(stockInput(field(form, 'stockQuantity'), form.dataset.expectedStock ?? ''), form.dataset.variantId); }
      catch (failure) { view.error(failure instanceof Error ? failure.message : 'Revise el stock.', false); }
    }
    else if (form.matches('[data-simple-form]')) {
      if (stockDrafts.size) { event.preventDefault(); view.error('Guarde primero el stock.', false); return; }
      event.preventDefault(); const route = controller.route(); if (!('id' in route) || generalPending() || blocked(variantDirty, 'Guarde primero la variante.')) return;
      try {
        const price = variantInput({ sku: form.dataset.simpleSku ?? '', name: 'Estándar', currency: field(form, 'currency').toUpperCase(),
          price: field(form, 'price'), supplyMode: field(form, 'supplyMode') as ''|'stock'|'made_to_order' });
        if (form.dataset.simpleId) void variant?.savePrice(price, form.dataset.simpleId); else void variant?.save(price);
      }
      catch (e) { view.error(e instanceof Error ? e.message : 'Revise el precio.', false); }
    }
    else if (form.matches('[data-variant-form]')) {
      event.preventDefault(); const route = controller.route();
      if (blocked(stockDrafts.size > 0, 'Guarde primero el stock.')) return;
      if (generalPending() || blocked(simpleDirty || !!pricing?.pending(), 'Guarde primero el precio.')) return;
      if (route.view !== 'variant-create' && route.view !== 'variant-edit' && form.dataset.inlineVariant === undefined) return;
      try { void variant?.save({ ...variantFormInput(name => field(form, name, name === 'salePrice'), { material: true, color: true }), options: readVariantOptions(form) }, route.view === 'variant-edit' ? route.variantId : form.dataset.inlineVariant || undefined); }
      catch (failure) { view.error(failure instanceof Error ? failure.message : 'Revise los datos de la variante.', false); }
    }
  };
  const click = (event: Event) => {
    const target = event.target as Element;
    const costToggle = target.closest<HTMLElement>('[data-variant-cost-toggle]');
    if (costToggle) { const form = costToggle.closest('form'); const open = form?.classList.toggle('show-variant-costs'); costToggle.setAttribute('aria-expanded', String(!!open)); return; }
    const cls = target.closest<HTMLElement>('[data-taxonomy-create], [data-taxonomy-confirm]');
    if (cls) { const kind = (cls.dataset.taxonomyCreate ?? cls.dataset.taxonomyConfirm) as TaxonomyKind;
      if (['categories','materials','colors'].includes(kind)) {
        if (cls.dataset.taxonomyCreate) toggleClassification(root, kind); else void createClassification(root, kind, session, controller.beginMutation, view.busy);
      } return;
    }
    if (target.closest('[data-product-publish], [data-product-unpublish]')) {
      if (generalPending() || otherPending() || galleryPending()) return;
      if (target.closest('[data-product-publish]')) void controller.transition('publish');
      else if (window.confirm('¿Quitar este producto del catálogo y volver a borrador?')) void controller.transition('unpublish');
      return;
    }
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-product-action]'); if (!button) return;
    const action = button.dataset.productAction, route = controller.route();
    if (route.view === 'list' && ['create', 'detail', 'page', 'clear-search', 'clear-filters'].includes(action ?? '') && !mayLeave()) return;
    if (action === 'create') void controller.navigate({ view: 'create' });
    else if (action === 'clear-search' && route.view === 'list') void controller.list(1, '');
    else if (action === 'clear-filters' && route.view === 'list') void controller.list(1, '', {});
    else if (action === 'detail' && button.dataset.productId) void controller.navigate({ view: 'detail', id: button.dataset.productId });
    else if (action === 'edit' && route.view === 'detail') void controller.navigate({ view: 'edit', id: route.id, ...(route.page ? { page: route.page } : {}) });
    else if (action === 'list' && mayLeave()) void controller.list();
    else if (action === 'page') void controller.list(Number(button.dataset.productPage));
    else if (action === 'cancel' && button.closest('[data-inline-variant-slot]')) {
      if (variantDrawer) { variantDrawer.requestClose(); return; }
      if (variantDirty && !window.confirm('¿Descartar los cambios de esta variante?')) return;
      closeVariant();
    } else if (action === 'cancel' && mayLeave()) void controller.cancel();
    else if (action === 'retry') controller.retry();
    else if (action === 'categories') categories?.refresh();
    else if (action === 'materials') material?.refresh();
    else if (action === 'colors') color?.refresh();
    else if ((action === 'variant-create' || action === 'variant-edit' || action === 'variant-personalize') && (route.view === 'detail' || route.view === 'edit')) {
      if (generalPending() || otherPending()) return;
      const first = button.dataset.firstVariant;
      void openVariant(route, button.dataset.variantId || first, button);
    }
    else if (action === 'variant-page' && (route.view === 'detail' || route.view === 'edit') && mayLeave()) void controller.navigate({ view: 'detail', id: route.id, page: Number(button.dataset.productPage) });
    else if (action === 'variant-archive' && button.dataset.variantId && !generalPending() && !otherPending()) void variant?.archive(button.dataset.variantId, false);
    else if (action === 'archive' && !generalPending() && !otherPending() && !galleryPending()) void controller.archive(root.dataset.productArchived === 'true');
  };
  const change = (event: Event) => {
    const field = event.target as HTMLInputElement, name = field.name;
    const stock = field.closest<HTMLFormElement>('[data-stock-form]'); if (stock) { if (field.value === stock.dataset.expectedStock) stockDrafts.delete(stock); else stockDrafts.add(stock); }
    if (name === 'initialSupplyMode' || name === 'initialUnlimited') { const error = get('[data-initial-supply-error]'); if (error) error.textContent = ''; field.removeAttribute('aria-invalid'); updateInitialPrice(); }
    if (name && (field.closest('[data-product-form]') || field.form?.matches('[data-product-form]'))) { dirty = true; progress(); }
    if (name && field.closest('[data-simple-form]')) simpleDirty = true;
    if (name && field.closest('[data-variant-form]')) variantDirty = true;
    if (name === 'categoryId') categoryChanged = true;
    if (name === 'materialId') assignments.material = true;
    if (name === 'colorId') assignments.color = true;
  };
  const input = (event: Event) => {
    const field = event.target as HTMLInputElement;
    const stock = field.closest<HTMLFormElement>('[data-stock-form]'); if (stock) { if (field.value === stock.dataset.expectedStock) stockDrafts.delete(stock); else stockDrafts.add(stock); }
    if (['initialPrice', 'initialCost', 'initialMarkup'].includes(field.name)) { const error = get('[data-initial-price-error]'); if (error) error.textContent = ''; field.removeAttribute('aria-invalid'); updateInitialPrice(); }
    if (field.name && (field.closest('[data-product-form]') || field.form?.matches('[data-product-form]'))) {
      dirty = true; progress();
      if (field.name === 'slug') slugEdited = true;
      if (field.name === 'name') {
        const preview = get('[data-preview-name]'); if (preview) preview.textContent = field.value || 'Nombre del producto';
        const check = get('[data-check-name]'); if (check && root.dataset.productView === 'create') check.textContent = field.value.trim() ? 'Nombre indicado · sin guardar' : 'Falta un nombre';
        const slug = get<HTMLInputElement>('[name="slug"]'); if (slug && !slugEdited && root.dataset.productView === 'create') slug.value = suggestedSlug(field.value);
      }
    }
    if (field.name && field.closest('[data-simple-form]')) simpleDirty = true;
    const form = field.closest<HTMLFormElement>('[data-variant-form]');
    if (field.name && form) {
      variantDirty = true; const sku = form.querySelector<HTMLInputElement>('[name="sku"]');
      if (field.name === 'sku') form.dataset.customSku = 'true';
      if (field.name === 'name' && sku && !form.dataset.customSku && form.dataset.inlineVariant === '') {
        sku.value = ('MD-' + root.dataset.productId + '-' + suggestedSlug(field.value, 80)).toUpperCase();
      }
    }
    if (field.name !== 'currency') return;
    field.value = field.value.toUpperCase(); const help = get('[data-variant-price-help]'); if (!help) return;
    try { help.textContent = `Hasta ${currencyFractionDigits(field.value)} decimales; no se realiza conversión de moneda.`; }
    catch { help.textContent = 'Indique primero una moneda válida.'; }
  };
  const mediaUpdate = (event: Event) => { if (root.dataset.productId) refreshCoverPreview(root, root.dataset.productId, (event as CustomEvent).detail); };
  const keydown = (event: KeyboardEvent) => { const box = (event.target as Element).closest('[data-taxonomy-box]'); if (box && event.key === 'Enter') { event.preventDefault(); box.querySelector<HTMLButtonElement>('[data-taxonomy-confirm]')?.click(); } };
  const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } };
  const imageFailed = (event: Event) => { const image = event.target as HTMLImageElement; if (image.matches('[data-product-thumbnail]')) image.hidden = true; };
  root.ownerDocument.defaultView?.addEventListener('beforeunload', beforeUnload);
  root.addEventListener('product-media-updated', mediaUpdate); root.addEventListener('keydown', keydown);
  root.addEventListener('error', imageFailed, true);
  root.addEventListener('submit', submit); root.addEventListener('click', click); root.addEventListener('change', change); root.addEventListener('input', input); setupFields();
  const disposeOptions = mountVariantOptions(root);
  return () => {
    disposeOptions();
    staged?.dispose(); handoff = undefined;
    root.removeEventListener('error', imageFailed, true);
    root.ownerDocument.defaultView?.removeEventListener('beforeunload', beforeUnload);
    controller.dispose(); clearFields(); media.dispose(); root.removeEventListener('product-media-updated', mediaUpdate); root.removeEventListener('keydown', keydown); root.removeEventListener('submit', submit); root.removeEventListener('click', click); root.removeEventListener('change', change); root.removeEventListener('input', input);
  };
}
