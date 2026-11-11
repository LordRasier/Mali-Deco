import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CatalogTaxonomy, TaxonomyGroup } from '../../../modules/catalog/services/catalog-taxonomy';
import { parseCatalogQuery } from '../../../modules/catalog/validation/catalog-validation';
import { categoryIcons, defaultCategoryPresentation, type CategoryPresentation } from '../../../shared/category-presentation';

const labels = { categories: 'Categorías', materials: 'Materiales', colors: 'Colores' };
type Item = { id: string; name: string; slug: string; sortOrder: number; archivedAt: Date | null; hex?: unknown; presentation?: CategoryPresentation };
function projection(item: Item, kind: TaxonomyGroup) {
  if (kind === 'colors' && item.hex !== null && typeof item.hex !== 'string') throw new Error('Invalid color response');
  const presentation = item.presentation ?? defaultCategoryPresentation();
  return { id: item.id, name: item.name, slug: item.slug, sortOrder: String(item.sortOrder), hex: kind === 'colors' ? item.hex as string | null ?? '' : '',
    ...presentation, image: presentation.image.replace(/\/catalog\/category-images\/([^/]+)\//, '/admin/catalog/categories/$1/image/'),
    icons: Object.entries(categoryIcons).map(([id, icon]) => ({ id, ...icon, selected: id === presentation.icon })) };
}
function base(kind: TaxonomyGroup) {
  return { layout: false as const, section: 'classifications' as const, available: true, message: '', title: labels[kind], kind,
    color: kind === 'colors', category: kind === 'categories', editing: false, page: 1, pages: 1, total: 0, previousPage: 1, nextPage: 2, hasPrevious: false, hasNext: false,
    tabs: (Object.keys(labels) as TaxonomyGroup[]).map(id => ({ id, label: labels[id], selected: id === kind })),
    item: { id: '', name: '', slug: '', sortOrder: '0', hex: '' }, items: [] as ReturnType<typeof projection>[] };
}

/** Authorization is performed by AdminPage before this bounded, read-only projection is invoked. */
export class ClassificationsPage {
  constructor(private readonly taxonomy: Pick<CatalogTaxonomy, 'list'>) {}
  async read(query: Record<string, unknown>) {
    const kind = query.kind ?? 'categories', view = query.view ?? 'list';
    if (typeof kind !== 'string' || !Object.hasOwn(labels, kind) || typeof view !== 'string' || !['list', 'create', 'edit'].includes(view)) throw new BadRequestException('Invalid classification view');
    const group = kind as TaxonomyGroup;
    const keys = view === 'list' ? ['view', 'kind', 'page'] : view === 'create' ? ['view', 'kind'] : ['view', 'kind', 'page', 'id'];
    if (Object.keys(query).some(key => !keys.includes(key))) throw new BadRequestException('Invalid classification query');
    if (view === 'create') return { view: 'admin-classification-form', model: { ...base(group), title: `Nueva opción · ${labels[group]}` } };
    if (view === 'edit' && (typeof query.id !== 'string' || !/^[-\x21-\x7e]{1,36}$/.test(query.id))) throw new BadRequestException('Invalid classification identifier');
    const { page } = parseCatalogQuery({ page: query.page });
    const result = await this.taxonomy.list(group, { page: String(page), limit: '24' });
    if (view === 'edit') {
      const item = result.items.find(item => item.id === query.id && !item.archivedAt);
      if (!item) throw new NotFoundException('Classification changed or is no longer on this page');
      return { view: 'admin-classification-form', model: { ...base(group), page, title: `Editar opción · ${labels[group]}`, editing: true, item: projection(item, group) } };
    }
    const pages = Math.max(1, Math.ceil(result.total / 24));
    return { view: 'admin-classifications-list', model: { ...base(group), page, pages, total: result.total, items: result.items.map(item => projection(item, group)),
      hasPrevious: page > 1, hasNext: page < pages && page < 10000, previousPage: page - 1, nextPage: page + 1 } };
  }
}
