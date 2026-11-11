import type { SiteConfig } from '../../modules/settings/site-config';
import type { StoreInformation } from '../information/store-information';
import { absoluteUrl, catalogCanonical, publicOrigin, serializedJson } from './urls';
import { productSchema } from './product-schema';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { defaultContentConfig, type ContentConfig } from '../../modules/settings/content-config';
import { productSharePath, type SharedProduct } from '../catalog/shared/product-sharing';

export const SEO_ENV = Symbol('SEO_ENV');
export type SeoEnvironment = { NODE_ENV?: string; PUBLIC_SITE_URL?: string };
type Model = Record<string, unknown> & { brand?: string; name?: string; title?: string; description?: string; noindex?: boolean; demo?: boolean; empty?: boolean; currencyUnavailable?: boolean; unpublished?: boolean; defaultCurrency?: string; page?: { title: string; intro: string }; productDetail?: Awaited<ReturnType<PublicCatalog['detail']>> };
const publicViews = new Set(['home', 'catalog', 'product', 'information-page', 'shipping-returns']);
const descriptionText = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 300);

export function pageMetadata(view: string, model: Model, path: string, params: URLSearchParams, status: number, config: SiteConfig, env: SeoEnvironment, information?: StoreInformation) {
  const content = model.content as ContentConfig | undefined ?? defaultContentConfig();
  const origin = publicOrigin(config.publicSiteUrl || env.PUBLIC_SITE_URL), brand = model.brand || 'Tienda';
  const privatePage = !publicViews.has(view), error = status >= 400 || !!model.demo;
  const shared = !error && view === 'catalog' ? model.sharedProduct as SharedProduct | undefined : undefined;
  const filtered = view === 'catalog' && ['search', 'category', 'material', 'color', 'minPriceMinor', 'maxPriceMinor', 'sort'].some(key => params.has(key));
  const noindex = env.NODE_ENV !== 'production' || privatePage || error || !!shared || !!model.noindex || filtered || !!model.empty || !!model.currencyUnavailable || !!model.unpublished;
  let title = model.title || brand, description = descriptionText(model.description || ''), canonicalPath = path.toLowerCase();
  if (view === 'home') canonicalPath = '/';
  if (view === 'product' && model.productDetail) canonicalPath = `/productos/${encodeURIComponent(model.productDetail.slug)}`;
  if (view === 'catalog') canonicalPath = typeof model.categoryPath === 'string' ? model.categoryPath : '/catalogo';
  if (view === 'home') { title = config.homeTitle || `${brand} · ${content.copy.home.title} ${content.copy.home.titleAccent}`; description = config.homeDescription || content.copy.home.description; }
  if (view === 'catalog') { title = `${typeof model.categoryName === 'string' ? model.categoryName : content.copy.catalog.seoTitle} · ${brand}`; description = content.copy.catalog.seoDescription; canonicalPath = catalogCanonical(canonicalPath, params, model.defaultCurrency || ''); }
  if (view === 'product') {
    title = `${model.name || model.title} | ${brand}`;
    if (!description && model.ready === true) description = descriptionText(`Conocé ${model.name || model.title} de ${brand}. Consultá sus características y opciones disponibles.`);
  }
  if (view === 'information-page') { title = `${model.page?.title || 'Información'} | ${brand}`; description = descriptionText(model.page?.intro || ''); }
  if (view === 'information-page') { const page = model.page as { seoTitle?: string; seoDescription?: string } | undefined; title = page?.seoTitle || title; description = descriptionText(page?.seoDescription || description); }
  if (view === 'shipping-returns') { title = `Envíos y reembolsos | ${brand}`; description = `Cómo recibir tu pedido y consultar envíos, cambios y reembolsos en ${brand}.`; }
  if (view === 'catalog' && Number(params.get('page') || 1) > 1) title += ` · Página ${params.get('page')}`;
  if (shared) { title = `${shared.name} | ${brand}`; description = descriptionText(shared.description || `Conoce ${shared.name} de ${brand}.`); }
  const canonical = !noindex && canonicalPath ? absoluteUrl(origin, canonicalPath.replace(/\/$/, '') || '/') : '';
  let image = absoluteUrl(origin, '/api/v1/catalog/branding/hero'), imageAlt = `Imagen de ${brand}`;
  const pictured = shared ?? model.productDetail;
  if (pictured?.images?.[0]) {
    image = absoluteUrl(origin, `/api/v1/catalog/images/${encodeURIComponent(pictured.images[0].id)}?w=1600`);
    imageAlt = descriptionText(pictured.images[0].alt || pictured.name);
  }
  const graph: unknown[] = [];
  if (origin && !noindex) {
    if (view === 'home') {
      graph.push({ '@type': 'WebSite', '@id': `${origin}/#website`, name: brand, url: origin + '/' });
      graph.push({ '@type': 'Organization', '@id': `${origin}/#organization`, name: brand, url: origin + '/', logo: absoluteUrl(origin, '/api/v1/catalog/branding/logo'), ...(information?.instagram ? { sameAs: [information.instagram.href] } : {}) });
    }
    if (view === 'product' && model.productDetail) graph.push(productSchema(model.productDetail, origin, brand, typeof model.selectedVariantId === 'string' ? model.selectedVariantId : undefined));
    if (view === 'product' || view === 'catalog') {
      const entries = [{ name: 'Inicio', item: origin + '/' }, { name: 'Catálogo', item: origin + '/catalogo' }];
      if (model.productDetail?.category) entries.push({ name: model.productDetail.category.name, item: `${origin}/categorias/${encodeURIComponent(model.productDetail.category.slug)}` });
      if (view === 'product') entries.push({ name: model.name || model.title || 'Producto', item: canonical });
      else if (model.categoryName) entries.push({ name: String(model.categoryName), item: canonical });
      graph.push({ '@type': 'BreadcrumbList', itemListElement: entries.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, ...entry })) });
    }
  }
  const tracking = !privatePage && !error && env.NODE_ENV === 'production' && config.analyticsMode !== 'off' && content.pages['politica-de-privacidad'].enabled;
  return { title, description, canonical, origin, socialUrl: shared ? absoluteUrl(origin, productSharePath(shared.id).split('#')[0]) : canonical,
    noindex, robots: noindex ? privatePage || error ? 'noindex, nofollow' : 'noindex, follow' : 'index, follow, max-image-preview:large', image, imageAlt, brand,
    socialType: view === 'product' || shared ? 'product' : 'website', jsonLd: graph.length ? serializedJson({ '@context': 'https://schema.org', '@graph': graph }) : '',
    analyticsMode: tracking ? config.analyticsMode : '', analyticsId: tracking ? config.analyticsMode === 'ga4' ? config.ga4Id : config.gtmId : '' };
}

export function publicCsp(nonce: string, analytics: boolean): string {
  const scripts = analytics ? ' https://*.googletagmanager.com' : '';
  const destinations = analytics ? ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com' : '';
  return `default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self' 'nonce-${nonce}'${scripts}; img-src 'self'${destinations}; connect-src 'self'${destinations}; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'`;
}
