import { ApiError } from '../../api';
import { fetchAdminSection } from '../admin-runtime';
type View = { busy(value: boolean): void; show(html: string): void; error(message: string): void };
type Session = { getEpoch(): number; expire(): void };
type Load = (query: URLSearchParams, signal: AbortSignal) => Promise<string>;

export function createOrdersReader(view: View, session: Session, load: Load = (query, signal) => fetchAdminSection('orders', signal, fetch, query)) {
  let active = true, revision = 0, request: AbortController | undefined, query = new URLSearchParams();
  async function read(next: URLSearchParams) {
    if (!active) return;
    query = new URLSearchParams(next); request?.abort(); const controller = new AbortController(); request = controller;
    const generation = ++revision, epoch = session.getEpoch(), current = () => active && revision === generation && session.getEpoch() === epoch && !controller.signal.aborted;
    view.error(''); view.busy(true);
    try { if (!current()) return; const html = await load(query, controller.signal); if (current()) view.show(html); }
    catch (failure) {
      if (!current()) return;
      if (failure instanceof ApiError && failure.status === 401) session.expire();
      else view.error(failure instanceof Error ? failure.message : 'No se pudo cargar el pedido.');
    } finally { if (current()) view.busy(false); }
  }
  return { read, retry: () => read(query), dispose() { active = false; revision++; request?.abort(); } };
}
