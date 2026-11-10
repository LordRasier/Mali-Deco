import { apiRequest } from '../../api';
import { parseSiteConfig, type SiteConfig } from '../../../../../modules/settings/site-config';
import type { sessionStore } from '../../session-store';

export function mountSiteEditor(root: HTMLElement, session: typeof sessionStore) {
  const form = root.querySelector<HTMLFormElement>('[data-site-form]');
  if (!form) return () => {};
  const fields = form.querySelector<HTMLFieldSetElement>('[data-site-fields]')!;
  const message = form.querySelector<HTMLElement>('[data-site-message]')!;
  const reload = form.querySelector<HTMLButtonElement>('[data-site-reload]')!;
  const mode = form.elements.namedItem('analyticsMode') as HTMLSelectElement;
  mode.value = mode.dataset.initialValue ?? 'off';
  let revision = Number(form.dataset.revision), available = form.dataset.available === 'true', active = true, busy = false;
  fields.disabled = !available;
  const notice = (text: string, error = false) => { message.textContent = text; message.setAttribute('role', error ? 'alert' : 'status'); };
  async function run(save: boolean) {
    const state = session.getSnapshot(), epoch = session.getEpoch();
    const current = () => active && epoch === session.getEpoch();
    if (!active || busy || state.status !== 'authenticated' || state.user?.role !== 'owner' || (save && (!state.csrf || !available))) return;
    let settings: SiteConfig | undefined;
    try { if (save) settings = parseSiteConfig(Object.fromEntries(new FormData(form!))); }
    catch (e) { notice(e instanceof Error ? e.message : 'Revisá los campos.', true); return; }
    busy = true; fields.disabled = true; reload.disabled = true; notice('');
    try {
      const result = await apiRequest<{ settings: SiteConfig; revision: number; available: boolean }>('/admin/settings/seo', save ? { method: 'PUT', body: { settings, revision }, csrf: state.csrf! } : undefined);
      if (!current()) return;
      const confirmed = parseSiteConfig(result.settings);
      if (!Number.isSafeInteger(result.revision) || result.revision < 0 || typeof result.available !== 'boolean' || (save && (result.revision !== revision + 1 || JSON.stringify(confirmed) !== JSON.stringify(settings)))) throw Error('No se pudo confirmar el guardado. Recargá antes de reintentar.');
      for (const [key, value] of Object.entries(confirmed)) (form!.elements.namedItem(key) as HTMLInputElement).value = value;
      revision = result.revision; available = result.available;
      notice(!available ? 'Aplicá la actualización SEO de la base y recargá estos ajustes.' : save ? 'Configuración guardada. Se aplica al abrir la tienda.' : 'Configuración recargada.');
    } catch (e) { if (current()) notice(e instanceof Error ? e.message : 'No se pudieron guardar los ajustes.', true); }
    finally { busy = false; if (current()) { fields.disabled = !available; reload.disabled = false; } }
  }
  const save = (event: Event) => { event.preventDefault(); void run(true); };
  const refresh = () => { void run(false); };
  form.addEventListener('submit', save); reload.addEventListener('click', refresh);
  return () => { active = false; fields.disabled = true; form.removeEventListener('submit', save); reload.removeEventListener('click', refresh); };
}
