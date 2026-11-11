import { apiRequest } from '../../api';
import type { sessionStore } from '../../session-store';
import type { TaxonomyKind } from '../../types';
import { readAdminSection } from '../admin-fragment';
import { createClassifications, type ClassificationRuntime, type ClassificationView } from './classification-controller';
import { classificationRoute, fetchClassifications } from './classification-runtime';
import { suggestedSlug } from '../../../shared/suggested-slug';
import { parseCategoryPresentation } from '../../../../../shared/category-presentation';

type Control = HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement;
function value(form: HTMLFormElement, name: string) {
  const field = form.elements.namedItem(name);
  if (!field || !('value' in field) || typeof field.value !== 'string') throw new Error('El formulario no está completo.');
  return field.value;
}

export function mountClassifications(root: HTMLElement, session: typeof sessionStore, options: { runtime?: ClassificationRuntime } = {}) {
  const disabled = new Map<Control, boolean>(); let busy = false, loading = false, customSlug = false, imagePreview = '';
  const releasePreview = () => { if (imagePreview) URL.revokeObjectURL(imagePreview); imagePreview = ''; };
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const updateSlug = (form: HTMLFormElement) => {
    if (root.dataset.classificationView !== 'create') return;
    const slug = form.elements.namedItem('slug') as HTMLInputElement | null;
    if (slug && (!customSlug || !slug.value.trim())) { slug.value = suggestedSlug(value(form, 'name'), 80); customSlug = false; }
  };
  const setupSlug = () => {
    const form = get<HTMLFormElement>('[data-classification-form]'); customSlug = false;
    if (form && root.dataset.classificationView === 'create') {
      const slug = value(form, 'slug'); customSlug = !!slug && slug !== suggestedSlug(value(form, 'name'), 80); updateSlug(form);
    }
  };
  const progress = () => {
    root.setAttribute('aria-busy', String(busy || loading)); const notice = get('[data-classification-loading]');
    if (notice) { notice.hidden = !busy && !loading; notice.textContent = busy ? 'Guardando cambios…' : 'Cargando opciones…'; }
  };
  const view: ClassificationView = {
    render(html, expected) {
      const next = readAdminSection(root.ownerDocument, 'classifications', html), route = classificationRoute(next.dataset);
      if (route.kind !== expected.kind || route.view !== expected.view || ('page' in expected && (!('page' in route) || route.page !== expected.page))
        || (expected.view === 'edit' && (route.view !== 'edit' || route.id !== expected.id))) throw new Error('La vista de clasificación cambió. Intente nuevamente.');
      for (const key of ['classificationKind', 'classificationView', 'classificationPage', 'classificationId']) {
        if (next.dataset[key] === undefined) delete root.dataset[key]; else root.dataset[key] = next.dataset[key];
      }
      releasePreview(); root.classList.toggle('category-editor', route.kind === 'categories' && route.view !== 'list');
      root.classList.toggle('classification-list', route.view === 'list');
      root.replaceChildren(...Array.from(next.childNodes)); disabled.clear(); setupSlug(); progress();
    },
    loading(flag) { loading = flag; progress(); },
    busy(flag) {
      if (busy === flag) return; busy = flag;
      if (flag) for (const control of Array.from(root.querySelectorAll<Control>('input, button, textarea, select'))) { disabled.set(control, control.disabled); control.disabled = true; }
      else { for (const [control, state] of disabled) control.disabled = state; disabled.clear(); }
      progress();
    },
    error(message, retry) { const node = get('[data-classification-message]'); if (node) { node.textContent = message; node.hidden = !message; }
      const button = get('[data-classification-action="retry"]'); if (button) button.hidden = !retry; },
    committed() {
      releasePreview();
      const heading = root.ownerDocument.createElement('h1'); heading.textContent = 'Cambios guardados';
      const notice = root.ownerDocument.createElement('p'); notice.setAttribute('data-classification-message', ''); notice.setAttribute('role', 'alert'); notice.hidden = true;
      const progress = root.ownerDocument.createElement('p'); progress.setAttribute('data-classification-loading', ''); progress.setAttribute('role', 'status');
      const retry = root.ownerDocument.createElement('button'); retry.setAttribute('type', 'button'); retry.setAttribute('data-classification-action', 'retry'); retry.textContent = 'Reintentar lectura'; retry.hidden = true;
      const back = root.ownerDocument.createElement('button'); back.setAttribute('type', 'button'); back.setAttribute('data-classification-action', 'list'); back.textContent = 'Volver a la lista';
      root.replaceChildren(heading, notice, progress, retry, back); root.dataset.classificationView = 'list'; root.dataset.classificationPage = '1'; delete root.dataset.classificationId;
    },
    focus() { const heading = get('h1'); if (heading && !root.closest('[hidden]')) { heading.setAttribute('tabindex', '-1'); heading.focus(); } },
    presentationSaved(p) {
      releasePreview();
      const img = get<HTMLImageElement>('[data-category-image]');
      if (img) { img.hidden = !p.image; if (p.image) img.src = p.image.replace(/\/catalog\/category-images\/([^/]+)\//, '/admin/catalog/categories/$1/image/'); else img.removeAttribute('src'); }
      const file = get<HTMLInputElement>('[name="imageFile"]'); if (file) file.value = '';
      const remove = get<HTMLInputElement>('[name="removeImage"]'); if (remove) remove.checked = false;
      const notice = get('[data-category-saved]'); if (notice) notice.hidden = false;
    },
  };
  const editor = createClassifications(session, view, options.runtime ?? { read: fetchClassifications, request: apiRequest,
    confirm: () => window.confirm('¿Archivar esta opción? Solo se puede archivar si ningún artículo o variante la utiliza.') }, classificationRoute(root.dataset));
  const submit = (event: Event) => {
    const form = event.target as HTMLFormElement;
    if (form.matches('[data-category-presentation]')) {
      event.preventDefault();
      try {
        const remove = (form.elements.namedItem('removeImage') as HTMLInputElement).checked;
        const presentation = parseCategoryPresentation({ description: value(form, 'categoryDescription'), imageAlt: value(form, 'categoryImageAlt'), icon: value(form, 'categoryIcon'), removeImage: remove });
        const file = (form.elements.namedItem('imageFile') as HTMLInputElement).files?.[0];
        if (file && !remove && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size)) throw Error('Elegí una imagen JPG, PNG o WebP de hasta 5 MB.');
        const body = new FormData(); body.set('presentation', JSON.stringify(presentation)); if (file && !remove) body.set('file', file);
        const notice = get('[data-category-saved]'); if (notice) notice.hidden = true;
        void editor.savePresentation(body);
      } catch (failure) { view.error(failure instanceof Error ? failure.message : 'Revisá la imagen y los textos.', false); }
      return;
    }
    if (!form.matches('[data-classification-form]')) return;
    event.preventDefault();
    try { updateSlug(form); void editor.save({ name: value(form, 'name'), slug: value(form, 'slug'), sortOrder: value(form, 'sortOrder'), hex: editor.route().kind === 'colors' ? value(form, 'hex') : '' }); }
    catch (failure) { view.error(failure instanceof Error ? failure.message : 'Revise los datos.', false); }
  };
  const click = (event: Event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-classification-action]'); if (!button) return;
    const action = button.dataset.classificationAction;
    if (action === 'create') void editor.create();
    else if (action === 'edit' && button.dataset.classificationId) void editor.edit(button.dataset.classificationId);
    else if (action === 'archive' && button.dataset.classificationId) void editor.archive(button.dataset.classificationId);
    else if (action === 'cancel') void editor.cancel();
    else if (action === 'list') void editor.page(1);
    else if (action === 'page') void editor.page(Number(button.dataset.classificationPage));
    else if (action === 'kind' && ['categories', 'materials', 'colors'].includes(button.dataset.classificationKind ?? '')) void editor.kind(button.dataset.classificationKind as TaxonomyKind);
    else if (action === 'retry') editor.retry();
    else if (action === 'products') window.location.hash = 'products';
  };
  const input = (event: Event) => {
    const field = event.target as HTMLInputElement, form = field.form;
    if (form?.matches('[data-category-presentation]')) {
      const notice = get('[data-category-saved]'); if (notice) notice.hidden = true;
      if (field.name === 'imageFile') {
        const file = field.files?.[0], img = get<HTMLImageElement>('[data-category-image]');
        if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024 && img) {
          releasePreview(); imagePreview = URL.createObjectURL(file); img.src = imagePreview; img.hidden = false;
          (form.elements.namedItem('removeImage') as HTMLInputElement).checked = false;
        }
      }
      return;
    }
    if (!form?.matches('[data-classification-form]') || root.dataset.classificationView !== 'create') return;
    if (field.name === 'slug') customSlug = !!field.value.trim() && field.value !== suggestedSlug(value(form, 'name'), 80);
    else if (field.name === 'name') updateSlug(form);
  };
  setupSlug(); root.addEventListener('submit', submit); root.addEventListener('click', click); root.addEventListener('input', input);
  return () => { releasePreview(); editor.dispose(); root.removeEventListener('submit', submit); root.removeEventListener('click', click); root.removeEventListener('input', input); };
}
