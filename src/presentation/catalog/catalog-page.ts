import { localCheckoutPageEnabled } from '../presentation-policy';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import type { PublicFacets } from '../../modules/catalog/services/public-facets';
import { catalogCards, catalogLink, publicProducts } from './catalog-view';
import { catalogQueryParams, emptyCatalogQuery, parseCatalogQuery, type CatalogQuery } from './shared/catalog-query';
import { demoCatalog } from './shared/demo-catalog';
import { demoFacets, demoListing } from './shared/demo-listing';
import { catalogFilters } from './catalog-filters-view';

import { canonicalRoutes, type StorefrontRoutes } from '../routing/storefront-routes';
import { fixtureImageId } from './shared/editorial-art';
import { defaultContentConfig, type ContentConfig } from '../../modules/settings/content-config';
import type { ContentSettings } from '../../modules/settings/content-settings';

type Field = { name: string; value: string };
type Model = {
  checkoutEnabled: boolean; layout: false; routes: StorefrontRoutes; mode: 'demo' | 'api'; demo: boolean; brand: string; defaultCurrency: string;
  failed: boolean; message: string; invalid: boolean; currencyUnavailable: boolean; unpublished: boolean; showPagination: boolean;
  cards: ReturnType<typeof catalogCards>; empty: boolean; total: number; page: number; pages: number;
  previous: string; next: string; clear: string; retry: string; action: string; search: string;
  searchFields: Field[]; sortFields: Field[]; sortOptions: { value: string; label: string; selected: boolean; disabled: boolean }[];
  activeFilters: { label: string; href: string }[]; truncated: boolean; resultLabel: string;
  categories: { label: string; href: string; selected: boolean; disabled: boolean }[];
  filters: ReturnType<typeof catalogFilters> | null;
  showFilters: boolean; filterQuery: string;
};
type Result = { status: number; redirect?: string; model: Model };

/** Read-only SSR orchestration; service failures never become demonstration data. */
export class CatalogPage {
  constructor(private readonly catalog: Pick<PublicCatalog, 'settings' | 'list'>,
    private readonly facets: Pick<PublicFacets, 'get'>, private readonly mode: 'api' | 'demo', private readonly routes: StorefrontRoutes = canonicalRoutes,
    private readonly env: { NODE_ENV?: string; LOCAL_TEST_CHECKOUT_ENABLED?: string; DEV_FIXTURE_PRODUCT_ID?: string } = {},
    private readonly content?: Pick<ContentSettings, 'get'>) {}

  async read(params: URLSearchParams, previewListing?: ContentConfig['listing']): Promise<Result> {
    const link = (query: CatalogQuery) => catalogLink(query, this.routes.catalog);
    const parsed = parseCatalogQuery(params), query = parsed.query;
    const model: Model = { layout: false, routes: this.routes, checkoutEnabled: localCheckoutPageEnabled(this.env, this.mode), mode: this.mode, demo: this.mode === 'demo', brand: 'Tienda', defaultCurrency: '', failed: false, invalid: !!parsed.error,
      message: parsed.error ?? '', currencyUnavailable: false, unpublished: false, showPagination: false, cards: [], empty: false, total: 0, page: query.page, pages: 0,
      previous: '', next: '', clear: this.routes.catalog, retry: link(query), action: this.routes.catalog, search: query.search,
      searchFields: [], sortFields: [], sortOptions: [], activeFilters: [], categories: [], truncated: false, resultLabel: '', filters: null, showFilters: false, filterQuery: '' };
    if (parsed.error) return { status: 400, model };
    try {
      const listing = previewListing ?? (this.content ? (await this.content.get()).settings.listing : defaultContentConfig().listing);
      const [settings, facets] = this.mode === 'demo' ? [{ name: demoCatalog.brand }, demoFacets(query.currency)]
        : await Promise.all([this.catalog.settings(), this.facets.get(query.currency ? { currency: query.currency } : {})]);
      model.brand = settings.name;
      model.defaultCurrency = facets.currencies.includes('ARS') ? 'ARS' : facets.currencies[0] ?? '';
      if (!query.currency && facets.currencies.length) {
        const next = { ...query, currency: model.defaultCurrency };
        if (parseCatalogQuery(catalogQueryParams(next)).error) throw new Error('Invalid currency metadata');
        query.currency = next.currency;
      }
      const clear: CatalogQuery = { ...emptyCatalogQuery(), currency: facets.currencies.includes(query.currency) ? query.currency : '' };
      model.clear = link(clear);
      model.filters = catalogFilters(query, facets);
      model.showFilters = listing.filtersEnabled; model.filterQuery = catalogQueryParams(query).toString();
      const fields = [...catalogQueryParams(query)].map(([name, value]) => ({ name, value }));
      model.searchFields = fields.filter(field => !['search', 'page'].includes(field.name));
      model.sortFields = fields.filter(field => !['sort', 'page'].includes(field.name));
      model.sortOptions = [['name_asc', 'Nombre: A–Z'], ['name_desc', 'Nombre: Z–A'], ['price_asc', 'Precio: menor a mayor'], ['price_desc', 'Precio: mayor a menor']]
        .map(([value, label]) => ({ value, label, selected: query.sort === value, disabled: value.startsWith('price_') && !query.currency }));
      const remove = (patch: Partial<CatalogQuery>) => link({ ...query, ...patch, page: 1 });
      model.categories = [{ label: listing.allCategoriesLabel, href: remove({ category: [] }), selected: !query.category.length, disabled: false },
        ...facets.categories.map(category => {
          const selected = query.category.includes(category.slug), disabled = !selected && query.category.length >= 20;
          const simple = !query.category.length && !query.search && !query.material.length && !query.color.length && !query.minPriceMinor && !query.maxPriceMinor && query.sort === 'name_asc' && query.currency === model.defaultCurrency;
          return { label: category.name, selected, disabled, href: disabled ? '' : simple ? `/categorias/${encodeURIComponent(category.slug)}` : remove({ category: selected ? query.category.filter(slug => slug !== category.slug) : [...query.category, category.slug] }) };
        })];
      if (query.search) model.activeFilters.push({ label: `Búsqueda: ${query.search}`, href: remove({ search: '' }) });
      for (const [key, choices] of [['category', facets.categories], ['material', facets.materials], ['color', facets.colors]] as const) {
        for (const slug of query[key]) model.activeFilters.push({ label: choices.find(item => item.slug === slug)?.name ?? slug, href: remove({ [key]: query[key].filter(item => item !== slug) }) });
      }
      if (query.minPriceMinor) model.activeFilters.push({ label: 'Precio mínimo', href: remove({ minPriceMinor: '' }) });
      if (query.maxPriceMinor) model.activeFilters.push({ label: 'Precio máximo', href: remove({ maxPriceMinor: '' }) });
      model.truncated = Object.values(facets.truncated).some(Boolean);
      if (query.currency && !facets.currencies.includes(query.currency)) {
        model.currencyUnavailable = true; model.message = 'La moneda del enlace no está disponible en este catálogo. Limpiá los filtros para continuar.';
        return { status: 200, model };
      }
      const input = Object.fromEntries(catalogQueryParams(query));
      const result = this.mode === 'demo' ? demoListing(query, Number(listing.pageSize))
        : await this.catalog.list({ ...input, page: String(query.page), limit: listing.pageSize }).then(result => ({ ...result, items: publicProducts(result) }));
      model.cards = catalogCards(result.items, model.demo, this.routes.product, fixtureImageId(this.env)); model.total = result.total; model.empty = !result.items.length;
      model.unpublished = result.total === 0 && query.page === 1 && !query.currency && !model.activeFilters.length;
      model.resultLabel = `${result.total} ${result.total === 1 ? listing.itemSingular : listing.itemPlural}`;
      model.pages = Math.ceil(result.total / result.limit);
      if (query.page > Math.max(1, model.pages)) {
        model.previous = link({ ...query, page: Math.max(1, model.pages) }); model.showPagination = true;
        return { status: 404, model };
      }
      // Pagination preserves the requested page, unlike filter changes.
      if (query.page > 1) model.previous = link({ ...query, page: query.page - 1 });
      if (query.page < model.pages && query.page < 10000) model.next = link({ ...query, page: query.page + 1 });
      model.showPagination = Boolean(model.previous || model.next);
      return { status: 200, model };
    } catch {
      model.failed = true; model.showFilters = false; model.cards = []; model.message = 'No pudimos cargar el catálogo y sus filtros. Intentá nuevamente.';
      return { status: 503, model };
    }
  }
}
