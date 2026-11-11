/** Curated SVG paths: category icons never contain uploaded markup. */
export const categoryIcons = {
  grid: { label: 'Colección', path: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  box: { label: 'Caja', path: 'm12 3 9 5v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5' },
  dice: { label: 'Dados', path: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3 M7 7h.01 M17 7h.01 M12 12h.01 M7 17h.01 M17 17h.01' },
  cards: { label: 'Cartas', path: 'M8 3h11v16H8z M5 6l-3 1 4 15 11-3 M11 8l2.5-2 2.5 2-2.5 2z M11 14h5' },
  leaf: { label: 'Naturaleza', path: 'M20 3C9 2 3 7 4 14s15 10 16-11Z M4 21 15 10 M9 16v-5 M9 16h5' },
  home: { label: 'Hogar', path: 'm3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8' },
  star: { label: 'Estrella', path: 'm12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9z' },
  gift: { label: 'Regalo', path: 'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8C4 8 5 1 9 3c2 1 3 5 3 5Zm0 0c8 0 7-7 3-5-2 1-3 5-3 5Z' },
} as const;
export type CategoryIcon = keyof typeof categoryIcons;
export type CategoryPresentation = { description: string; icon: CategoryIcon; imageAlt: string; image: string };
export const defaultCategoryPresentation = (): CategoryPresentation => ({ description: '', icon: 'grid', imageAlt: '', image: '' });
export function parseCategoryPresentation(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid category presentation');
  const v = input as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || !['description', 'icon', 'imageAlt', 'removeImage'].every(k => Object.hasOwn(v, k))) throw Error('Invalid presentation fields');
  for (const [key, max] of [['description', 300], ['imageAlt', 150]] as const) {
    if (typeof v[key] !== 'string' || v[key].length > max || /[<>\p{Cs}\p{Cc}]/u.test(v[key])) throw Error('Invalid presentation text');
  }
  if (typeof v.icon !== 'string' || !Object.hasOwn(categoryIcons, v.icon) || typeof v.removeImage !== 'boolean') throw Error('Invalid category icon or image');
  return { description: (v.description as string).trim(), imageAlt: (v.imageAlt as string).trim(), icon: v.icon as CategoryIcon, removeImage: v.removeImage };
}
