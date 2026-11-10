import { ApiError } from '../../api';
import type { sessionStore } from '../../session-store';
import { canManageCatalog } from '../../session-core';
import { parseMediaList } from '../media/media-types';
import type { AdminProductsRuntime, ProductMutationLease } from './product-controller';

export function mountVariantImages(root: HTMLElement, session: typeof sessionStore, runtime: AdminProductsRuntime,
  owner: { reserve(): ProductMutationLease | null; busy(value: boolean): void; allowed(): boolean }) {
  const epoch = session.getEpoch(), doc = root.ownerDocument; let active = true, generation = 0, writing = false;
  let panel: HTMLElement | undefined;
  const current = () => active && session.getEpoch() === epoch && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  const close = () => { generation++; panel?.remove(); panel = undefined; };
  const open = async (button: HTMLButtonElement) => {
    if (!current() || writing || !owner.allowed()) return;
    const form = button.closest<HTMLElement>('[data-pricing-form]'), id = form?.dataset.variantId, productId = root.dataset.productId;
    if (!form || !id || !productId) return;
    close(); const version = generation;
    const box = doc.createElement('div'); box.className = 'variant-image-picker'; panel = box;
    const heading = doc.createElement('strong'); heading.textContent = 'Elegir imagen de esta variante';
    const dismiss = doc.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Cerrar'; dismiss.addEventListener('click', () => { if (!writing) { close(); button.focus(); } });
    const top = doc.createElement('div'); top.className = 'editor-card-heading'; top.append(heading, dismiss);
    const note = doc.createElement('p'); note.setAttribute('role', 'status'); note.textContent = 'Cargando imágenes.';
    box.append(top, note); form.append(box);
    const accepts = () => current() && generation === version && root.contains(box);
    try {
      const images = parseMediaList(await runtime.request(`/admin/catalog/products/${encodeURIComponent(productId)}/images`)).items.filter(image => !image.retired);
      if (!accepts()) return;
      note.textContent = images.length ? 'Las imágenes pertenecen a la galería del producto.' : 'Agregá fotos a la galería del producto para poder elegirlas.';
      const grid = doc.createElement('div'); grid.className = 'variant-image-choices'; box.append(grid);
      const choose = async (imageId: string | null) => {
        if (!accepts() || writing) return;
        const csrf = session.getSnapshot().csrf; if (!csrf) return;
        const lease = owner.reserve(); if (!lease) return;
        writing = true; owner.busy(true); note.textContent = 'Guardando imagen.';
        try {
          const saved = await runtime.request(`/admin/catalog/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(id)}/image`, {
            method: 'PUT', csrf, body: { imageId, expectedImageId: form.dataset.imageId || null } }) as { id?: string; productId?: string; imageId?: string | null };
          if (!accepts() || !lease.current()) return;
          if (saved?.id !== id || saved.productId !== productId || saved.imageId !== imageId) throw Error('No se pudo confirmar el guardado. Volvé a abrir el producto.');
          form.dataset.imageId = imageId ?? '';
          const thumb = button.querySelector<HTMLImageElement>('img')!, placeholder = button.querySelector<HTMLElement>('[data-variant-image-placeholder]')!;
          if (imageId) thumb.src = `/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/content?w=320`;
          else thumb.removeAttribute('src');
          thumb.hidden = !imageId; placeholder.hidden = !!imageId;
          close();
        } catch (error) {
          if (accepts()) { if (error instanceof ApiError && error.status === 401) session.expire(); else note.textContent = error instanceof Error ? error.message : 'No se pudo guardar la imagen.'; }
        } finally { if (current() && lease.current()) owner.busy(false); writing = false; lease.release(); if (!panel) button.focus(); }
      };
      const option = (id: string | null, alt: string) => {
        const pick = doc.createElement('button'); pick.type = 'button'; pick.setAttribute('aria-label', alt); pick.setAttribute('aria-pressed', String((form.dataset.imageId || null) === id));
        if (id) { const img = doc.createElement('img'); img.src = `/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(id)}/content?w=320`; img.alt = alt; pick.append(img); }
        else pick.textContent = 'Sin imagen';
        pick.addEventListener('click', () => { void choose(id); }); grid.append(pick);
      };
      option(null, 'Sin imagen'); images.forEach((image, index) => option(image.id, image.alt || `Imagen ${index + 1}`));
    } catch (error) { if (accepts()) note.textContent = error instanceof Error ? error.message : 'No se pudieron cargar las imágenes.'; }
  };
  const click = (event: Event) => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-variant-image]'); if (button) void open(button); };
  root.addEventListener('click', click);
  return { pending: () => writing, dispose() { active = false; close(); root.removeEventListener('click', click); } };
}
