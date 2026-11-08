import { apiRequest } from '../../api';
import { isTaxonomyItem } from '../../taxonomy-data';
import { taxonomyInput } from '../../../shared/taxonomy-input';
import type { TaxonomyKind } from '../../types';
import type { sessionStore } from '../../session-store';
import type { ProductMutationLease } from './product-controller';
import { suggestedSlug } from '../../../shared/suggested-slug';
export { suggestedSlug } from '../../../shared/suggested-slug';

const fields = { categories: 'categoryId', materials: 'materialId', colors: 'colorId' } as const;
export function toggleClassification(root: HTMLElement, kind: TaxonomyKind) {
  const box = root.querySelector<HTMLElement>(`[data-taxonomy-box="${kind}"]`); if (!box) return;
  box.hidden = !box.hidden;
  root.querySelector(`[data-taxonomy-create="${kind}"]`)?.setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) box.querySelector('input')?.focus();
}

export async function createClassification(root: HTMLElement, kind: TaxonomyKind, session: typeof sessionStore,
  reserve: () => ProductMutationLease | null, setBusy: (value: boolean) => void) {
  const box = root.querySelector<HTMLElement>(`[data-taxonomy-box="${kind}"]`), input = box?.querySelector<HTMLInputElement>('[data-taxonomy-name]');
  const select = root.querySelector<HTMLSelectElement>(`select[name="${fields[kind]}"]`), note = box?.querySelector<HTMLElement>('[data-taxonomy-note]');
  const csrf = session.getSnapshot().csrf; if (!box || !input || !select || !note || !csrf) return;
  if (select.disabled) { note.textContent = 'Actualice las opciones antes de crear una nueva.'; return; }
  const lease = reserve(); if (!lease) return;
  try {
    const body = taxonomyInput(kind, { name: input.value, slug: suggestedSlug(input.value, 80), sortOrder: '0', hex: box.querySelector<HTMLInputElement>('[data-taxonomy-hex]')?.value ?? '' }, true);
    setBusy(true); note.textContent = 'Guardando opción…';
    const saved = await apiRequest('/admin/catalog/' + kind, { method: 'POST', csrf, body });
    if (!lease.current() || !root.contains(box)) return;
    if (!isTaxonomyItem(saved) || saved.slug !== body.slug) throw Error('No se pudo confirmar la opción. Actualice la lista antes de reintentar.');
    if (!Array.from(select.options).some(o => o.value === saved.id)) select.add(new Option(saved.name, saved.id));
    select.value = saved.id; select.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = ''; note.textContent = ''; toggleClassification(root, kind);
    const status = root.querySelector<HTMLElement>(kind === 'categories' ? '[data-product-category-message]' : kind === 'colors' ? '[data-variant-color-message]' : '[data-variant-material-message]');
    if (status) status.textContent = 'Opción creada y seleccionada.';
  } catch (e) {
    if (lease.current()) note.textContent = e instanceof Error ? e.message : 'No se pudo crear la opción.';
  } finally { if (lease.current()) setBusy(false); lease.release(); }
}

export function refreshCoverPreview(root: HTMLElement, productId: string, detail?: { coverUrl: string | null; count: number }) {
  const preview = root.querySelector<HTMLImageElement>('[data-preview-cover]'), fallback = root.querySelector<HTMLElement>('[data-preview-placeholder]');
  const check = root.querySelector<HTMLElement>('[data-check-cover]');
  if (!preview || !fallback || !productId) return;
  const media = root.querySelector('[data-product-media-slot]');
  if (!detail && (!media || !media.querySelector('[data-media-content]:not([hidden])'))) return;
  const url = detail ? detail.coverUrl : media?.querySelector('ol img')?.getAttribute('src');
  const expected = '/api/v1/admin/catalog/products/' + encodeURIComponent(productId) + '/images/';
  const cover = url?.startsWith(expected) && /^[\w-]+\/content\?w=320$/.test(url.slice(expected.length)) ? url : null;
  if (cover) { if (preview.getAttribute('src') !== cover) preview.src = cover; }
  else preview.removeAttribute('src');
  preview.hidden = !cover; fallback.hidden = !!cover;
  if (check) check.textContent = cover ? 'Portada seleccionada' : 'Falta una foto de portada';
}
