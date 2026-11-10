import type { TaxonomyGroup } from '../../../modules/catalog/services/catalog-taxonomy';

export type TaxonomyDraft = { name: string; slug: string; sortOrder: string; hex: string };
/** Canonical browser form validation shared by the native and transitional React editors. */
export function taxonomyInput(kind: TaxonomyGroup, draft: TaxonomyDraft, create: boolean) {
  const name = draft.name.trim();
  if (!name || name.length > 100) throw new Error('El nombre debe tener entre 1 y 100 caracteres.');
  if (create && (draft.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug))) throw new Error('El identificador debe usar hasta 80 minúsculas, números y guiones.');
  if (!/^\d+$/.test(draft.sortOrder)) throw new Error('El orden debe ser un número entero entre 0 y 4294967295.');
  const sortOrder = Number(draft.sortOrder);
  if (!Number.isSafeInteger(sortOrder) || sortOrder > 4294967295) throw new Error('El orden debe ser un número entero entre 0 y 4294967295.');
  const hex = draft.hex.trim();
  if (kind === 'colors' && hex && !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('El color debe ser hexadecimal, por ejemplo #F47B6B.');
  return { name, sortOrder, ...(create ? { slug: draft.slug } : {}), ...(kind === 'colors' ? { hex: hex || null } : {}) };
}
