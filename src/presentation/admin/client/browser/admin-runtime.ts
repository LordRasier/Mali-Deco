import { ApiError } from '../api';
import type { AdminSection } from '../navigation';
import type { AdminRuntime } from './admin-workspace';

/** HTML reads are separate from the unchanged JSON mutation transport. Never replay a write. */
export async function fetchAdminSection(section: AdminSection, signal: AbortSignal, fetcher: typeof fetch = fetch, query?: URLSearchParams): Promise<string> {
  let response: Response;
  try {
    const suffix = query?.toString();
    response = await fetcher(`/admin/sections/${encodeURIComponent(section)}${suffix ? `?${suffix}` : ''}`, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    });
  } catch { throw new ApiError(0, 'No se pudo conectar con el servicio. Intente nuevamente.'); }
  if (!response.ok) {
    throw new ApiError(response.status, response.status === 403 ? 'Su cuenta no tiene acceso a esta sección.'
      : response.status === 401 ? 'La sesión venció. Inicie sesión nuevamente.' : 'No se pudo cargar la sección. Intente nuevamente.');
  }
  if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new ApiError(502, 'El servicio devolvió una vista inválida.');
  let html: string;
  try { html = await response.text(); }
  catch { throw new ApiError(0, 'No se pudo completar la lectura. Intente nuevamente.'); }
  // A valid 65,535-byte description expands when escaped into HTML; leave room for its form and layout.
  if (!html.trim() || html.length > 1024 * 1024) throw new ApiError(502, 'El servicio devolvió una vista inválida.');
  return html;
}

export const browserAdminRuntime: AdminRuntime = {
  hash: () => window.location.hash,
  listen(callback) {
    window.addEventListener('hashchange', callback);
    return () => { window.removeEventListener('hashchange', callback); };
  },
  loadSection: fetchAdminSection,
};
