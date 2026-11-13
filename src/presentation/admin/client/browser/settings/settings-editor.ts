import { apiRequest, type RequestOptions } from '../../api';
import { normalizeInstagramUsername, normalizeWhatsAppNumber } from '../../../../../shared/social-links';

type View = { headerBrandMode?(): string; setHeaderBrandMode?(value: string): void; headerBrandEnabled?(): boolean; setHeaderBrandEnabled?(value: boolean): void; primaryColor(): string; setPrimaryColor(value: string): void; socialLinksEnabled(): boolean; setSocialLinksEnabled(value: boolean): void; focusField(field: 'name' | 'color' | 'whatsapp' | 'instagram' | 'headerBrand'): void; whatsappNumber(): string; setWhatsAppNumber(value: string): void; instagramUsername(): string; setInstagramUsername(value: string): void; value(): string; setValue(value: string): void; busy(value: boolean): void; notice(message: string, kind: 'error' | 'success' | ''): void; allowReload(value: boolean): void };
type Session = { getEpoch(): number; getSnapshot(): { status: string; csrf: string | null; user: { role: string } | null } };
type Request = (path: string, options?: RequestOptions) => Promise<unknown>;
const validHeaderMode = (value: unknown) => value === 'logo_text' || value === 'logo' || value === 'text';
function settingsResponse(value: unknown): value is { name: string | null; primaryColor: string; whatsappNumber?: string | null; instagramUsername?: string | null; headerBrandMode?: string } {
  return !!value && typeof value === 'object' && 'name' in value && (typeof value.name === 'string' || value.name === null) && 'primaryColor' in value && typeof value.primaryColor === 'string' && /^#[0-9a-f]{6}$/.test(value.primaryColor)
    && (!('headerBrandMode' in value) || validHeaderMode(value.headerBrandMode))
    && (!('whatsappNumber' in value) || value.whatsappNumber === null || (typeof value.whatsappNumber === 'string' && normalizeWhatsAppNumber(value.whatsappNumber) === value.whatsappNumber))
    && (!('instagramUsername' in value) || value.instagramUsername === null || (typeof value.instagramUsername === 'string' && normalizeInstagramUsername(value.instagramUsername) === value.instagramUsername));
}

/** Native controls own the draft; only explicit save/reload can replace it. Never retry writes automatically. */
export function createSettingsEditor(view: View, session: Session, request: Request = apiRequest) {
  let active = true, busy = false;
  async function run(save: boolean) {
    const state = session.getSnapshot();
    if (!active || busy || state.status !== 'authenticated' || state.user?.role !== 'owner' || (save && !state.csrf)) return;
    const raw = view.value(), name = raw.trim();
    if (save && (!name || Array.from(name).length > 255 || /[\p{Cc}\uD800-\uDFFF]/u.test(raw))) {
      view.notice('Ingresá un nombre de entre 1 y 255 caracteres, sin controles.', 'error'); view.focusField('name'); return;
    }
    const primaryColor = view.primaryColor().toLowerCase();
    if (save && !/^#[0-9a-f]{6}$/.test(primaryColor)) { view.notice('Elegí un color válido.', 'error'); view.focusField('color'); return; }
    const whatsappNumber = normalizeWhatsAppNumber(view.whatsappNumber());
    const instagramUsername = normalizeInstagramUsername(view.instagramUsername());
    const socialLinksEnabled = view.socialLinksEnabled();
    const headerBrandEnabled = view.headerBrandEnabled?.() ?? false, headerBrandMode = view.headerBrandMode?.() ?? 'logo_text';
    if (save && headerBrandEnabled && !validHeaderMode(headerBrandMode)) { view.notice('Elegí cómo mostrar la marca en el encabezado.', 'error'); view.focusField('headerBrand'); return; }
    if (save && socialLinksEnabled && whatsappNumber === null) { view.notice('Ingresá WhatsApp con código de país y área. Para un celular argentino: 549 + área + número, sin 0 ni 15.', 'error'); view.focusField('whatsapp'); return; }
    if (save && socialLinksEnabled && instagramUsername === null) { view.notice('Ingresá un usuario o enlace de perfil de Instagram válido.', 'error'); view.focusField('instagram'); return; }
    const epoch = session.getEpoch(), current = () => active && session.getEpoch() === epoch;
    busy = true; view.notice('', ''); view.busy(true);
    try {
      if (!current()) return;
      const result = await request('/admin/settings', save ? { method: 'PUT', body: { name, primaryColor, ...(headerBrandEnabled ? { headerBrandMode } : {}), ...(socialLinksEnabled ? { whatsappNumber, instagramUsername } : {}) }, csrf: state.csrf! } : undefined);
      if (!current()) return;
      if (!settingsResponse(result) || (save && (result.name !== name || result.primaryColor !== primaryColor || (headerBrandEnabled && result.headerBrandMode !== headerBrandMode) || (socialLinksEnabled && (result.whatsappNumber !== whatsappNumber || result.instagramUsername !== instagramUsername))))) throw Error('No se pudo confirmar los ajustes guardados. Recargá los ajustes antes de reintentar.');
      view.setValue(result.name ?? ''); view.setPrimaryColor(result.primaryColor); view.setWhatsAppNumber(result.whatsappNumber ?? ''); view.setInstagramUsername(result.instagramUsername ?? '');
      const socialAvailable = Object.hasOwn(result, 'whatsappNumber') && Object.hasOwn(result, 'instagramUsername');
      view.setSocialLinksEnabled(socialAvailable);
      view.setHeaderBrandMode?.(result.headerBrandMode ?? 'logo_text'); view.setHeaderBrandEnabled?.(!!result.headerBrandMode);
      view.allowReload(!socialAvailable || (!!view.setHeaderBrandEnabled && !result.headerBrandMode)); view.notice(save ? 'Ajustes guardados. Recargá la tienda para ver los cambios.' : 'Ajustes recargados.', 'success');
    } catch (error) {
      if (current()) { view.notice(error instanceof Error ? error.message : 'No se pudieron actualizar los ajustes.', 'error'); view.allowReload(true); }
    } finally { busy = false; if (current()) view.busy(false); }
  }
  return { save: () => run(true), reload: () => run(false), dispose() { active = false; } };
}
