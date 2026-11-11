import { informationPages, type InformationPage } from './content-pages';
import { shippingPage } from './content-shipping';
import { contentCopy } from './content-copy';
import { legacyLanding } from '../../shared/landing-layout';
import { defaultAppearance } from '../../shared/store-appearance';

export const pagePaths = { contacto: '/contacto', 'politica-de-privacidad': '/politica-de-privacidad', 'terminos-y-condiciones': '/terminos-y-condiciones',
  'preguntas-frecuentes': '/preguntas-frecuentes', 'sobre-mali': '/sobre-nosotros', 'envios-y-reembolsos': '/envios-y-reembolsos',
  cuidados: '/cuidados', seguimiento: '/seguimiento', 'cambios-y-devoluciones': '/cambios-y-devoluciones', arrepentimiento: '/arrepentimiento' } as const;
export type PageKey = keyof typeof pagePaths;
export type ContentPage = InformationPage & { enabled: boolean; seoTitle: string; seoDescription: string };
export type FooterLink = { target: string; label: string };

export function defaultContentConfig() {
  const pages = Object.fromEntries(Object.entries({ ...informationPages, 'envios-y-reembolsos': shippingPage }).map(([key, page]) =>
    [key, { ...structuredClone(page), enabled: true, seoTitle: '', seoDescription: '' }])) as Record<PageKey, ContentPage>;
  const standalone = (label: string, sections: InformationPage['sections']): ContentPage => ({ title: label, label, eyebrow: label, intro: '', sections: structuredClone(sections), enabled: true, seoTitle: '', seoDescription: '' });
  pages.cuidados = standalone('Cuidados de tus piezas', pages['preguntas-frecuentes'].sections.filter(s => s.id === 'cuidados'));
  pages.seguimiento = standalone('Seguimiento del envío', shippingPage.sections.filter(s => s.id === 'seguimiento'));
  pages['cambios-y-devoluciones'] = standalone('Cambios y devoluciones', shippingPage.sections.filter(s => ['devoluciones', 'reembolsos'].includes(s.id)));
  pages.arrepentimiento = standalone('Derecho de arrepentimiento', shippingPage.sections.filter(s => s.id === 'arrepentimiento'));
  pages['preguntas-frecuentes'].sections = pages['preguntas-frecuentes'].sections.filter(s => s.id !== 'cuidados');
  pages['envios-y-reembolsos'].sections = structuredClone(shippingPage.sections.filter(s => !['seguimiento', 'devoluciones', 'arrepentimiento'].includes(s.id)));
  return {
    copy: structuredClone(contentCopy), pages, appearance: defaultAppearance(),
    landing: legacyLanding(contentCopy.home, true),
    listing: { columns: '3', pageSize: '24', categoriesEnabled: true, filtersEnabled: false, countEnabled: true, cardCategoryEnabled: true, cardDescriptionEnabled: true, cardPriceEnabled: true,
      itemSingular: 'objeto', itemPlural: 'objetos', allCategoriesLabel: 'Todos', moreLabel: 'Ver más' },
    features: { catalog: true, cart: true, homeAbout: true },
    contact: { email: null as string | null, hours: null as string | null, legalName: null as string | null, taxId: null as string | null, legalAddress: null as string | null, dataFiscalUrl: null as string | null },
    footer: {
      brandEnabled: true, description: 'Diseño e impresión 3D. Objetos para hacer tu espacio más tuyo.',
      whatsappEnabled: true, instagramEnabled: true, emailEnabled: true, legalEnabled: true, dataFiscalEnabled: true,
      copyrightEnabled: true, copyright: 'Todos los derechos reservados.', topEnabled: true, topLabel: 'Volver arriba',
      orderNoteEnabled: true, orderNote: 'Tomamos pedidos por Instagram.', dataFiscalLabel: 'Data Fiscal · ARCA',
      benefits: [
        { enabled: true, icon: 'box', title: 'Hecho a pedido', description: 'Preparación estimada: 1 a 3 días.' },
        { enabled: true, icon: 'truck', title: 'Envíos en Argentina', description: 'Consultá costo y cobertura en el carrito.' },
        { enabled: true, icon: 'chat', title: 'Te ayudamos a elegir', description: 'Consultá por materiales, medidas y colores.' },
      ],
      columns: [
        { title: 'Tienda', enabled: true, links: [{ target: 'catalog', label: 'Todos los productos' }, { target: 'sobre-mali', label: 'Sobre nosotros' }, { target: 'cart', label: 'Mi carrito' }] },
        { title: 'Te ayudamos', enabled: true, links: [{ target: 'contacto', label: 'Contacto' }, { target: 'preguntas-frecuentes', label: 'Preguntas frecuentes' }, { target: 'cuidados', label: 'Cuidados de tus piezas' }, { target: 'seguimiento', label: 'Seguimiento del envío' }] },
        { title: 'Información', enabled: true, links: [{ target: 'envios-y-reembolsos', label: 'Envíos y reembolsos' }, { target: 'cambios-y-devoluciones', label: 'Cambios y devoluciones' }, { target: 'terminos-y-condiciones', label: 'Términos y condiciones' }, { target: 'politica-de-privacidad', label: 'Política de privacidad' }] },
      ],
      withdrawalLabel: 'Derecho de arrepentimiento',
    },
  };
}
export type ContentConfig = ReturnType<typeof defaultContentConfig>;
export const targetPaths: Record<string, string> = { ...pagePaths, catalog: '/catalogo', cart: '/carrito' };
export function targetEnabled(config: ContentConfig, target: string): boolean {
  if (target === 'catalog') return config.features.catalog;
  if (target === 'cart') return config.features.catalog && config.features.cart;
  return Object.hasOwn(config.pages, target) && config.pages[target as PageKey].enabled;
}
export const legacyTargets: Record<string, PageKey> = { '/sobre-mali': 'sobre-mali', '/preguntas-frecuentes#cuidados': 'cuidados', '/envios-y-reembolsos#seguimiento': 'seguimiento', '/envios-y-reembolsos#devoluciones': 'cambios-y-devoluciones' };
export function contentHref(config: ContentConfig, href: string): string {
  let path: string;
  try { path = decodeURIComponent(href.split('#')[0]).toLowerCase().replace(/\/$/, '') || '/'; } catch { return ''; }
  const fragment = href.includes('#') ? '#' + href.split('#')[1] : '';
  const legacy = legacyTargets[path + fragment] ?? legacyTargets[path];
  const target = legacy ?? Object.keys(targetPaths).find(key => targetPaths[key] === path);
  if (target) return targetEnabled(config, target) ? targetPaths[target] + (legacy ? '' : fragment) : '';
  if (/^\/(productos|categorias)(\/|$)/.test(path) && !config.features.catalog) return '';
  if (path === '/checkout' && !targetEnabled(config, 'cart')) return '';
  return href;
}
