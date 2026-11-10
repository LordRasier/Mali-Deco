import { apiRequest, type RequestOptions } from '../../api';

type Kind = 'logo' | 'icon' | 'hero' | 'about';
type Session = { getEpoch(): number; getSnapshot(): { status: string; csrf: string | null; user: { role: string } | null } };
type View = { busy(kind: Kind, value: boolean): void; notice(kind: Kind, text: string, error: boolean): void; saved(kind: Kind): void };
type Request = (path: string, options?: RequestOptions) => Promise<unknown>;

export function createBrandEditor(session: Session, view: View, request: Request = apiRequest) {
  let active = true, busy = false;
  async function upload(kind: Kind, file: File | undefined) {
    const state = session.getSnapshot();
    if (!active || busy || state.status !== 'authenticated' || state.user?.role !== 'owner' || !state.csrf) return;
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      view.notice(kind, 'Elegí una imagen JPG, PNG o WebP de hasta 5 MiB.', true); return;
    }
    const epoch = session.getEpoch(), current = () => active && session.getEpoch() === epoch;
    busy = true; view.notice(kind, '', false); view.busy(kind, true);
    try {
      if (!current()) return;
      const body = new FormData(); body.append('file', file);
      const result = await request(`/admin/settings/branding/${kind}`, { method: 'PUT', body, csrf: state.csrf });
      if (!current()) return;
      if (!result || typeof result !== 'object' || !('saved' in result) || result.saved !== true) throw Error('No se pudo confirmar el resultado. Recargá antes de reintentar.');
      view.saved(kind); view.notice(kind, 'Imagen guardada.', false);
    } catch (error) { if (current()) view.notice(kind, error instanceof Error ? error.message : 'No se pudo guardar la imagen.', true); }
    finally { busy = false; if (current()) view.busy(kind, false); }
  }
  return { upload, dispose() { active = false; } };
}
