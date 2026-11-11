import { contentHref, pagePaths, targetEnabled, targetPaths, type ContentConfig, type PageKey } from '../../modules/settings/content-config';
import { storeInformation, type StoreInformation } from './store-information';
import { previewAppearanceHref } from '../../modules/settings/content-appearance';

export function configuredInformation(base: StoreInformation, config: ContentConfig): StoreInformation {
  const fields = config.contact;
  const contacts = storeInformation({ STORE_CONTACT_EMAIL: fields.email ?? base.email?.value, STORE_CONTACT_HOURS: fields.hours ?? base.hours,
    STORE_LEGAL_NAME: fields.legalName ?? base.legalName, STORE_CUIT: fields.taxId ?? base.taxId, STORE_LEGAL_ADDRESS: fields.legalAddress ?? base.legalAddress,
    STORE_DATA_FISCAL_URL: fields.dataFiscalUrl ?? base.dataFiscalUrl, STORE_WHATSAPP_NUMBER: base.whatsapp?.value, STORE_INSTAGRAM_USERNAME: base.instagram?.value });
  return contacts;
}
export function contentPage(config: ContentConfig, key: PageKey) {
  const page = structuredClone(config.pages[key]);
  const sections = page.sections.map((section, index) => ({ ...section, editorPath: `pages.${key}.sections.${index}`,
    links: (section.links ?? []).flatMap((link, i) => {
      const href = contentHref(config, link.href); return href ? [{ ...link, href, editorPath: `pages.${key}.sections.${index}.links.${i}` }] : [];
    }),
  }));
  return { ...page, sections };
}
export function contentModel(config: ContentConfig, info: StoreInformation, preview = false) {
  const footer = config.footer;
  return { content: config, copy: config.copy, listing: config.listing, appearancePreviewHref: preview ? previewAppearanceHref(config) : undefined, catalogDisabled: !config.features.catalog, cartDisabled: !targetEnabled(config, 'cart'),
    contactHref: targetEnabled(config, 'contacto') ? pagePaths.contacto : '',
    footer: { ...footer,
      brandColumn: footer.brandEnabled || footer.emailEnabled && !!info.email || footer.whatsappEnabled && !!info.whatsapp || footer.instagramEnabled && !!info.instagram || footer.orderNoteEnabled && !!footer.orderNote,
      benefits: footer.benefits.map((b, i) => ({ ...b, [b.icon]: true, editorPath: `footer.benefits.${i}` })).filter(b => b.enabled),
      columns: footer.columns.map((column, index) => ({ ...column, editorPath: `footer.columns.${index}`, id: `footer-column-${index}`,
        links: column.links.map((link, i) => ({ ...link, href: targetPaths[link.target], editorPath: `footer.columns.${index}.links.${i}` })).filter(link => targetEnabled(config, link.target)),
      })).filter(c => c.enabled && c.links.length),
      whatsapp: footer.whatsappEnabled ? info.whatsapp : undefined, instagram: footer.instagramEnabled ? info.instagram : undefined,
      email: footer.emailEnabled ? info.email : undefined, hasSocial: (footer.whatsappEnabled && !!info.whatsapp) || (footer.instagramEnabled && !!info.instagram),
      withdrawalHref: targetEnabled(config, 'arrepentimiento') ? pagePaths.arrepentimiento : '',
      dataFiscalUrl: footer.dataFiscalEnabled ? info.dataFiscalUrl : undefined,
    } };
}
