import type { SocialSettings, StoreSettings } from '../../modules/settings/store-settings';
import { normalizeInstagramUsername, normalizeWhatsAppNumber } from '../../shared/social-links';
import type { HeaderBrandMode, HeaderBrandSettings } from '../../shared/header-brand';

export const STORE_INFORMATION = Symbol('STORE_INFORMATION');
type Channel = { label: string; value: string; href: string };

function socialChannels(phone: unknown, username: unknown) {
  const number = normalizeWhatsAppNumber(phone);
  const instagramName = normalizeInstagramUsername(username);
  const whatsapp: Channel | undefined = number ? { label: 'WhatsApp', value: `+${number}`, href: `https://wa.me/${number}` } : undefined;
  const instagram: Channel | undefined = instagramName ? { label: 'Instagram', value: `@${instagramName}`, href: `https://www.instagram.com/${instagramName}/` } : undefined;
  return { whatsapp, instagram, hasSocial: !!(whatsapp || instagram) };
}

/** Explicit public fields only: never pass the environment or payment/shipping credentials to views. */
export function storeInformation(env: NodeJS.ProcessEnv) {
  const email = (env.STORE_CONTACT_EMAIL ?? '').trim();
  const social = socialChannels(env.STORE_WHATSAPP_NUMBER ?? '', env.STORE_INSTAGRAM_USERNAME ?? '');
  const channels: Channel[] = [];
  if (/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(email)) {
    channels.push({ label: 'Email', value: email, href: `mailto:${email}` });
  }
  if (social.whatsapp) channels.push(social.whatsapp);
  if (social.instagram) channels.push(social.instagram);
  let dataFiscalUrl: string | undefined;
  try {
    const url = new URL(env.STORE_DATA_FISCAL_URL ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /(^|\.)(afip|arca)\.gob\.ar$/.test(url.hostname)) dataFiscalUrl = url.href;
  } catch { /* Omit an unset or invalid official link. */ }
  return Object.freeze({
    headerBrandMode: 'logo_text' as HeaderBrandMode,
    channels, hasContact: channels.length > 0, email: channels.find(channel => channel.label === 'Email'), ...social,
    hours: (env.STORE_CONTACT_HOURS ?? '').trim(),
    legalName: (env.STORE_LEGAL_NAME ?? '').trim(),
    taxId: /^\d{11}$/.test((env.STORE_CUIT ?? '').replace(/-/g, '')) ? env.STORE_CUIT?.replace(/-/g, '') : undefined,
    legalAddress: (env.STORE_LEGAL_ADDRESS ?? '').trim(),
    dataFiscalUrl,
  });
}

export type StoreInformation = ReturnType<typeof storeInformation>;

/** Null/missing values inherit initial config; an explicitly saved empty string hides the icon. */
export function withSocialSettings(base: StoreInformation, settings: SocialSettings & HeaderBrandSettings): StoreInformation {
  const social = socialChannels(settings.whatsappNumber ?? base.whatsapp?.value ?? '', settings.instagramUsername ?? base.instagram?.value ?? '');
  const channels = base.channels.filter(channel => !['WhatsApp', 'Instagram'].includes(channel.label));
  if (social.whatsapp) channels.push(social.whatsapp);
  if (social.instagram) channels.push(social.instagram);
  return { ...base, ...social, channels, hasContact: channels.length > 0, headerBrandMode: settings.headerBrandMode ?? base.headerBrandMode };
}

export class StoreInformationReader {
  constructor(private readonly fallback: StoreInformation, private readonly settings: Pick<StoreSettings, 'get'>) {}
  async get(): Promise<StoreInformation> {
    try { return withSocialSettings(this.fallback, await this.settings.get()); }
    catch { return this.fallback; }
  }
}
