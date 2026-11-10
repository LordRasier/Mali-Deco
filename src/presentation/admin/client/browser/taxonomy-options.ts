import { apiRequest } from '../api';
import { isTaxonomyPage } from '../taxonomy-data';
import type { Page, TaxonomyItem, TaxonomyKind } from '../types';

/** Complete bounded snapshots are shared by native and React forms; failure must never clear assignments. */
export async function loadTaxonomy(kind: TaxonomyKind, request: typeof apiRequest = apiRequest, signal?: AbortSignal): Promise<TaxonomyItem[]> {
  const result: TaxonomyItem[] = []; let total = 0, page = 1;
  do {
    signal?.throwIfAborted();
    const response = await request<Page<TaxonomyItem>>(`/admin/catalog/${kind}?page=${page}&limit=100`);
    signal?.throwIfAborted();
    if (!isTaxonomyPage(response, page, 100) || response.total > 1000 || (page > 1 && response.total !== total)) {
      throw new Error('No se pudo cargar la lista completa. Revise las clasificaciones antes de modificarlas.');
    }
    total = response.total;
    if (response.items.length !== Math.min(100, total - result.length)) throw new Error('El servicio devolvió una lista de clasificaciones incompleta.');
    result.push(...response.items);
    if (result.length > total || new Set(result.map(item => item.id)).size !== result.length) throw new Error('La lista de clasificaciones cambió. Vuelva a cargarla.');
    page++;
  } while (result.length < total);
  return result;
}
