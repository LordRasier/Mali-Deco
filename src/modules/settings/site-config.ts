export type SiteConfig = {
  publicSiteUrl: string; homeTitle: string; homeDescription: string;
  analyticsMode: 'off' | 'ga4' | 'gtm'; ga4Id: string; gtmId: string;
};
export const defaultSiteConfig = (): SiteConfig => ({ publicSiteUrl: '', homeTitle: '', homeDescription: '', analyticsMode: 'off', ga4Id: '', gtmId: '' });

/** Shared validation accepts identifiers, never pasted HTML or JavaScript. */
export function parseSiteConfig(value: unknown): SiteConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Configuración inválida.');
  const input = value as Record<string, unknown>, defaults = defaultSiteConfig();
  if (Object.keys(input).some(key => !Object.hasOwn(defaults, key)) || Object.keys(defaults).some(key => typeof input[key] !== 'string')) throw Error('Configuración incompleta.');
  const text = (key: keyof SiteConfig, limit: number) => {
    const raw = (input[key] as string).trim();
    const result = key === 'homeTitle' || key === 'homeDescription' ? raw.replace(/\s+/g, ' ') : raw;
    if (result.length > limit || /[\p{Cc}<>\uD800-\uDFFF]/u.test(result)) throw Error('Revisá el texto y la longitud de los campos.');
    return result;
  };
  const publicSiteUrl = text('publicSiteUrl', 250);
  if (publicSiteUrl) {
    let url: URL;
    try { url = new URL(publicSiteUrl); } catch { throw Error('Ingresá un dominio HTTPS válido.'); }
    if (url.protocol !== 'https:' || url.origin !== publicSiteUrl || url.username || url.password || url.port) throw Error('Usá HTTPS, sin rutas, puerto ni barra final.');
  }
  const analyticsMode = input.analyticsMode;
  if (analyticsMode !== 'off' && analyticsMode !== 'ga4' && analyticsMode !== 'gtm') throw Error('Elegí un modo de medición válido.');
  const ga4Id = text('ga4Id', 32).toUpperCase(), gtmId = text('gtmId', 32).toUpperCase();
  if (ga4Id && !/^G-[A-Z0-9]{6,20}$/.test(ga4Id)) throw Error('El identificador de Analytics debe comenzar con G-.');
  if (gtmId && !/^GTM-[A-Z0-9]{4,20}$/.test(gtmId)) throw Error('El identificador de Tag Manager debe comenzar con GTM-.');
  if ((analyticsMode === 'ga4' && !ga4Id) || (analyticsMode === 'gtm' && !gtmId)) throw Error('Completá el identificador del modo seleccionado.');
  return { publicSiteUrl, homeTitle: text('homeTitle', 150), homeDescription: text('homeDescription', 350), analyticsMode, ga4Id, gtmId };
}
