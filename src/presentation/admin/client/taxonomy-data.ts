import type { Page, TaxonomyItem } from './types';

export function isTaxonomyItem(value: unknown): value is TaxonomyItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TaxonomyItem>;
  return typeof item.id === 'string' && !!item.id && typeof item.slug === 'string' && typeof item.name === 'string' && Number.isSafeInteger(item.sortOrder) && item.archivedAt === null && (item.hex === undefined || item.hex === null || typeof item.hex === 'string');
}

export function isTaxonomyPage(value: unknown, page: number, limit: number): value is Page<TaxonomyItem> {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Page<TaxonomyItem>>;
  return Array.isArray(data.items) && data.items.every(isTaxonomyItem) && data.page === page && data.limit === limit && Number.isSafeInteger(data.total) && (data.total ?? -1) >= 0 && data.items.length <= limit && new Set(data.items.map(item => item.id)).size === data.items.length;
}
