import { fetchAdminSection } from '../admin-runtime';
import type { TaxonomyKind } from '../../types';
import type { ClassificationRoute } from './classification-controller';

export function fetchClassifications(route: ClassificationRoute, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const query = new URLSearchParams({ view: route.view, kind: route.kind });
  if ('page' in route) query.set('page', String(route.page));
  if (route.view === 'edit') query.set('id', route.id);
  return fetchAdminSection('classifications', signal, fetcher, query);
}
export function classificationRoute(data: Record<string, string | undefined>): ClassificationRoute {
  if (!['categories', 'materials', 'colors'].includes(data.classificationKind ?? '')) throw new Error('Clasificación inválida.');
  const kind = data.classificationKind as TaxonomyKind;
  if (data.classificationView === 'create') return { kind, view: 'create' };
  if (/^[1-9][0-9]*$/.test(data.classificationPage ?? '') && Number(data.classificationPage) <= 10000) {
    const page = Number(data.classificationPage);
    if (data.classificationView === 'list') return { kind, view: 'list', page };
    if (data.classificationView === 'edit' && /^[-\x21-\x7e]{1,36}$/.test(data.classificationId ?? '')) return { kind, view: 'edit', page, id: data.classificationId! };
  }
  throw new Error('La vista de clasificación no es válida.');
}
