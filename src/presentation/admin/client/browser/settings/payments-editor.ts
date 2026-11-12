import { apiRequest } from '../../api';
import type { sessionStore } from '../../session-store';

type Snapshot = { available: boolean; revision: number; enabled: boolean; mode: 'test' | 'production'; credentials: { mode: string; sellerId: string | null; configured: boolean; missing: string[]; webhookUrl: string | null }[] };
function snapshot(value: unknown): Snapshot {
  const v = value as Snapshot;
  if (!v || typeof v.enabled !== 'boolean' || typeof v.available !== 'boolean' || !Number.isSafeInteger(v.revision) || !['test', 'production'].includes(v.mode) || !Array.isArray(v.credentials) || v.credentials.length !== 2) throw Error('Respuesta de configuración inválida.');
  return v;
}
export function mountPaymentsEditor(root: HTMLElement, session: typeof sessionStore) {
  const form = root.querySelector<HTMLFormElement>('[data-payments-form]');
  if (!form) return () => {};
  const fields = form.querySelector<HTMLFieldSetElement>('fieldset')!;
  const enabled = form.querySelector<HTMLInputElement>('[name="enabled"]')!;
  const mode = form.querySelector<HTMLSelectElement>('[name="mode"]')!;
  const notice = form.querySelector<HTMLElement>('[data-payments-message]')!;
  const credentials = form.querySelector<HTMLElement>('[data-payments-credentials]')!;
  const reload = form.querySelector<HTMLButtonElement>('[data-payments-reload]')!;
  const verify = form.querySelector<HTMLButtonElement>('[data-payments-verify]')!;
  const warning = form.querySelector<HTMLElement>('[data-payments-warning]')!;
  const testLink = form.querySelector<HTMLAnchorElement>('[data-payments-test-link]')!;
  let active = true, busy = false, current: Snapshot | undefined;
  const draft = () => { warning.hidden = mode.value !== 'test' || !enabled.checked; };
  function render(value: Snapshot) {
    current = value; enabled.checked = value.enabled; mode.value = value.mode; draft();
    testLink.hidden = !(value.enabled && value.mode === 'test');
    credentials.replaceChildren(...value.credentials.map(c => {
      const card = document.createElement('div'); card.className = 'payment-credential-card';
      const title = document.createElement('h3'); title.textContent = c.mode === 'test' ? 'Pruebas' : 'Producción';
      const status = document.createElement('p'); status.textContent = c.configured ? `Credenciales configuradas · Vendedor ${c.sellerId}` : `Falta configurar: ${c.missing.join(', ') || 'credenciales válidas'}`;
      card.append(title, status);
      if (c.webhookUrl) { const label = document.createElement('label'); label.textContent = 'URL de notificaciones'; const input = document.createElement('input'); input.readOnly = true; input.value = c.webhookUrl; label.append(input); card.append(label); }
      return card;
    }));
  }
  async function run(action: 'load' | 'save' | 'verify') {
    const auth = session.getSnapshot(), epoch = session.getEpoch();
    if (!active || busy || auth.status !== 'authenticated' || auth.user?.role !== 'owner' || (action !== 'load' && !auth.csrf)) return;
    const valid = () => active && epoch === session.getEpoch();
    const selectedMode = mode.value, selectedEnabled = enabled.checked;
    busy = true; fields.disabled = true; reload.disabled = true; form!.setAttribute('aria-busy', 'true'); notice.textContent = action === 'verify' ? 'Verificando vendedor…' : 'Procesando…'; notice.setAttribute('role', 'status');
    try {
      if (action === 'verify') {
        const result = await apiRequest('/admin/settings/payments/verify', { method: 'POST', body: { mode: selectedMode }, csrf: auth.csrf! }) as { verified: boolean; sellerId: string };
        if (valid()) notice.textContent = result.verified ? `Conexión verificada. Vendedor ${result.sellerId}. No se creó ningún pago.` : 'No se pudo verificar la conexión.';
      } else {
        const value = snapshot(await apiRequest('/admin/settings/payments', action === 'save' ? { method: 'PUT', body: { enabled: selectedEnabled, mode: selectedMode, revision: current?.revision }, csrf: auth.csrf! } : undefined));
        if (!valid()) return;
        render(value);
        notice.textContent = !value.available ? 'Aplicá la actualización de base de datos de pagos y recargá esta sección.' : action === 'save' ? 'Configuración guardada. Los pedidos existentes conservan su entorno.' : 'Configuración actualizada.';
      }
    } catch (error) { if (valid()) { notice.textContent = error instanceof Error ? error.message : 'No se pudo completar la operación. Recargá antes de reintentar.'; notice.setAttribute('role', 'alert'); } }
    finally { busy = false; if (valid()) { fields.disabled = !current?.available; reload.disabled = false; form!.setAttribute('aria-busy', 'false'); } }
  }
  const save = (e: Event) => { e.preventDefault(); void run('save'); };
  const refresh = () => { void run('load'); }, check = () => { void run('verify'); };
  form.addEventListener('submit', save); reload.addEventListener('click', refresh); verify.addEventListener('click', check); mode.addEventListener('change', draft); enabled.addEventListener('change', draft);
  void run('load');
  return () => { active = false; form.removeEventListener('submit', save); reload.removeEventListener('click', refresh); verify.removeEventListener('click', check); mode.removeEventListener('change', draft); enabled.removeEventListener('change', draft); };
}
