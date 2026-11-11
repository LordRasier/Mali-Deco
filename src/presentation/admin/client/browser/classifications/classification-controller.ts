import { ApiError, type apiRequest } from '../../api';
import { canManageCatalog, type createSessionStore } from '../../session-core';
import { isTaxonomyItem } from '../../taxonomy-data';
import type { TaxonomyKind } from '../../types';
import { taxonomyInput, type TaxonomyDraft } from '../../../shared/taxonomy-input';
import { parseCategoryPresentation, type CategoryPresentation } from '../../../../../shared/category-presentation';

export type ClassificationRoute = { kind: TaxonomyKind; view: 'list'; page: number } | { kind: TaxonomyKind; view: 'create' }
  | { kind: TaxonomyKind; view: 'edit'; page: number; id: string };
export type ClassificationView = { render(html: string, route: ClassificationRoute): void; loading(value: boolean): void; busy(value: boolean): void;
  error(message: string, retry: boolean): void; committed(): void; focus(): void; presentationSaved?(value: CategoryPresentation): void };
export type ClassificationRuntime = { read(route: ClassificationRoute, signal: AbortSignal): Promise<string>; request: typeof apiRequest; confirm(): boolean };
type Session = Pick<ReturnType<typeof createSessionStore>, 'getSnapshot' | 'getEpoch' | 'expire'>;
const uncertain = 'No se pudo confirmar el resultado. La operación podría haberse completado; revise las clasificaciones antes de reintentar.';

export function createClassifications(session: Session, view: ClassificationView, runtime: ClassificationRuntime, initial: ClassificationRoute) {
  let active = true, busy = false, route = initial;
  let listing: ClassificationRoute & { view: 'list' } = { kind: initial.kind, view: 'list', page: 'page' in initial ? initial.page : 1 };
  let request: AbortController | undefined, retryRoute: ClassificationRoute | undefined; const epoch = session.getEpoch();
  const current = () => active && session.getEpoch() === epoch && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  async function navigate(next: ClassificationRoute) {
    if (!current() || busy) return;
    request?.abort(); const controller = new AbortController(); request = controller;
    const accepts = () => current() && request === controller && !controller.signal.aborted;
    retryRoute = undefined; view.error('', false); view.loading(true); if (!accepts()) return;
    try {
      const html = await runtime.read(next, controller.signal); if (!accepts()) return;
      view.render(html, next); if (!accepts()) return;
      route = { ...next }; if (next.view === 'list') listing = { ...next }; view.focus();
    } catch (failure) {
      if (!accepts()) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      retryRoute = next; view.error(failure instanceof Error ? failure.message : 'No se pudo cargar la clasificación.', true);
    } finally { if (accepts()) view.loading(false); }
  }
  async function write(method: 'POST' | 'PUT' | 'DELETE', id?: string, body?: ReturnType<typeof taxonomyInput>) {
    const csrf = session.getSnapshot().csrf, kind = route.kind;
    if (!current() || busy || !csrf || (id !== undefined && !/^[-\x21-\x7e]{1,36}$/.test(id))) return;
    busy = true; retryRoute = undefined; request?.abort(); view.loading(false); view.error('', false); view.busy(true); if (!current()) return;
    try {
      const result = await runtime.request(`/admin/catalog/${kind}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`, { method, ...(body ? { body } : {}), csrf });
      if (!current()) return;
      if (method === 'DELETE' ? result !== undefined : !isTaxonomyItem(result) || (id !== undefined && result.id !== id)) throw new ApiError(502, uncertain);
      route = { kind, view: 'list', page: 1 }; busy = false; view.busy(false); if (!current()) return;
      view.committed(); if (current()) await navigate(route);
    } catch (failure) {
      if (!current()) return;
      if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
      view.error(failure instanceof Error ? failure.message : uncertain, false);
    } finally { if (current()) { busy = false; view.busy(false); } }
  }
  return {
    route: () => route,
    kind: (kind: TaxonomyKind) => route.view === 'list' ? navigate({ kind, view: 'list', page: 1 }) : Promise.resolve(),
    page: (page: number) => route.view === 'list' ? navigate({ kind: route.kind, view: 'list', page }) : Promise.resolve(),
    create: () => route.view === 'list' ? navigate({ kind: route.kind, view: 'create' }) : Promise.resolve(),
    edit: (id: string) => route.view === 'list' ? navigate({ kind: route.kind, view: 'edit', page: route.page, id }) : Promise.resolve(),
    cancel: () => navigate(listing), retry: () => { if (retryRoute) void navigate(retryRoute); },
    save: async (draft: TaxonomyDraft) => {
      if (!current() || busy || route.view === 'list') return;
      try { const body = taxonomyInput(route.kind, draft, route.view === 'create'); await write(route.view === 'create' ? 'POST' : 'PUT', route.view === 'edit' ? route.id : undefined, body); }
      catch (failure) { if (current()) view.error(failure instanceof Error ? failure.message : 'Revise los datos.', false); }
    },
    savePresentation: async (body: FormData) => {
      const csrf = session.getSnapshot().csrf;
      if (!current() || busy || !csrf || route.kind !== 'categories' || route.view !== 'edit') return;
      const id = route.id;
      busy = true; request?.abort(); view.loading(false); view.error('', false); view.busy(true);
      if (!current()) return;
      try {
        const result = await runtime.request<{ id: string; presentation: CategoryPresentation }>(`/admin/catalog/categories/${encodeURIComponent(id)}/presentation`, { method: 'PUT', csrf, body });
        if (!current()) return;
        const p = result?.presentation;
        if (result?.id !== id || !p || typeof p.image !== 'string' || p.image !== '' && (p.image !== '/api/v1/catalog/category-images/' + id + '/' + p.image.split('/').at(-1) || !/^[0-9a-f-]{36}$/.test(p.image.split('/').at(-1)!))) throw new ApiError(502, uncertain);
        parseCategoryPresentation({ description: p.description, icon: p.icon, imageAlt: p.imageAlt, removeImage: false });
        view.presentationSaved?.(p);
      } catch (failure) {
        if (!current()) return;
        if (failure instanceof ApiError && failure.status === 401) { session.expire(); return; }
        view.error(failure instanceof Error ? failure.message : uncertain, false);
      } finally { if (current()) { busy = false; view.busy(false); } }
    },
    archive: async (id: string) => { if (current() && !busy && route.view === 'list' && runtime.confirm()) await write('DELETE', id); },
    dispose: () => { active = false; request?.abort(); },
  };
}
