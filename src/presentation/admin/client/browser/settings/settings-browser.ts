import type { sessionStore } from '../../session-store';
import { createSettingsEditor } from './settings-editor';
import { createBrandEditor } from './brand-editor';
import { mountSettingsTabs } from './settings-tabs';
import { mountSiteEditor } from './site-editor';

export function mountSettings(root: HTMLElement, session: typeof sessionStore) {
  const form = root.querySelector<HTMLFormElement>('[data-settings-form]');
  const input = root.querySelector<HTMLInputElement>('[data-settings-name]');
  const color = root.querySelector<HTMLInputElement>('[data-settings-color]');
  const whatsapp = root.querySelector<HTMLInputElement>('[data-settings-whatsapp]');
  const instagram = root.querySelector<HTMLInputElement>('[data-settings-instagram]');
  const fields = root.querySelector<HTMLFieldSetElement>('[data-settings-fields]');
  const message = root.querySelector<HTMLElement>('[data-settings-message]');
  const reload = root.querySelector<HTMLButtonElement>('[data-settings-reload]');
  if (!form || !input || !color || !whatsapp || !instagram || !fields || !message || !reload) throw Error('Incomplete settings form');
  const tabs = mountSettingsTabs(root);
  const disposeSite = mountSiteEditor(root, session);
  const schemaNotice = root.querySelector<HTMLElement>('[data-settings-schema-notice]');
  const editor = createSettingsEditor({
    primaryColor: () => color.value, setPrimaryColor: value => { color.value = value; },
    socialLinksEnabled: () => !whatsapp.disabled && !instagram.disabled,
    setSocialLinksEnabled: value => { whatsapp.disabled = !value; instagram.disabled = !value; if (schemaNotice) schemaNotice.hidden = value; },
    focusField: name => { tabs.select(name === 'name' || name === 'color' ? 'identity' : 'social'); ({ name: input, color, whatsapp, instagram })[name].focus(); },
    whatsappNumber: () => whatsapp.value, setWhatsAppNumber: value => { whatsapp.value = value; },
    instagramUsername: () => instagram.value, setInstagramUsername: value => { instagram.value = value; },
    value: () => input.value, setValue: value => { input.value = value; },
    busy: value => { fields.disabled = value; reload.disabled = value; form.setAttribute('aria-busy', String(value)); },
    notice: (text, kind) => { message.textContent = text; message.hidden = !text; message.setAttribute('role', kind === 'error' ? 'alert' : 'status'); },
    allowReload: value => { reload.hidden = !value; },
  }, session);
  const save = (event: Event) => { event.preventDefault(); void editor.save(); };
  const refresh = () => { void editor.reload(); };
  const brand = createBrandEditor(session, {
    busy: (_kind, value) => { for (const name of ['logo', 'icon', 'hero', 'about']) { const button = root.querySelector<HTMLButtonElement>(`[data-brand-submit="${name}"]`); if (button) button.disabled = value; } },
    notice: (kind, text, error) => { const node = root.querySelector<HTMLElement>(`[data-brand-message="${kind}"]`); if (node) { node.textContent = text; node.setAttribute('role', error ? 'alert' : 'status'); } },
    saved: kind => { const image = root.querySelector<HTMLImageElement>(`[data-brand-preview="${kind}"]`); if (image) image.src = `/api/v1/catalog/branding/${kind}?v=${Date.now()}`; },
  });
  const brandForms = (['logo', 'icon', 'hero', 'about'] as const).map(kind => {
    const node = root.querySelector<HTMLFormElement>(`[data-brand-form="${kind}"]`);
    const submit = (event: Event) => { event.preventDefault(); const file = root.querySelector<HTMLInputElement>(`[data-brand-file="${kind}"]`)?.files?.[0]; void brand.upload(kind, file); };
    node?.addEventListener('submit', submit); return { node, submit };
  });
  form.addEventListener('submit', save); reload.addEventListener('click', refresh); fields.disabled = false;
  return () => { editor.dispose(); brand.dispose(); tabs.dispose(); disposeSite(); for (const item of brandForms) item.node?.removeEventListener('submit', item.submit); form.removeEventListener('submit', save); reload.removeEventListener('click', refresh); fields.disabled = true; };
}
