import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CatalogAdmin } from '../../../modules/catalog/services/catalog-admin';
import type { ProductRow } from '../../../modules/catalog/models/catalog.entities';
import { parseCatalogQuery } from '../../../modules/catalog/validation/catalog-validation';
import { variantFormModel, variantListModel } from './admin-variants-model';
import { parseAdminProductListQuery } from '../../../modules/catalog/queries/admin-product-list';
import { productListItem } from './admin-product-list-model';
import { dimensionFields as dimensions, dimensionValue } from '../shared/product-dimensions';
import { groupProperties } from '../../catalog/shared/variant-properties';

const empty = (): ProductRow => ({ id: '', name: '', slug: '', description: '', status: 'draft', archivedAt: null, categoryId: null,
  productWeightG: null, productWidthMm: null, productHeightMm: null, productLengthMm: null,
  packageWeightG: null, packageWidthMm: null, packageHeightMm: null, packageLengthMm: null });
function model(product: ProductRow & Partial<Pick<Awaited<ReturnType<CatalogAdmin['getProduct']>>, 'variants' | 'page' | 'total'>> = empty()) {
  return { layout: false as const, section: 'products' as const, available: true, message: '', title: 'Productos', product,
    ...variantListModel(product, product.variants, product.total, product.page),
    editorView: 'create', editing: false, archived: Boolean(product.archivedAt), draft: product.status === 'draft', active: product.status === 'active',
    search: '', page: 1, pages: 1, total: 0, hasPrevious: false, hasNext: false, previousPage: 1, nextPage: 2,
    items: [] as ReturnType<typeof productListItem>[],
    dimensions: [{ label: 'Peso y medidas del producto por unidad', fields: dimensions.slice(0, 4) },
      { label: 'Paquete', fields: dimensions.slice(4) }].map(group => ({ label: group.label,
      fields: group.fields.map(([name, label]) => ({ name, label, inputMode: name.endsWith('Mm') ? 'decimal' : 'numeric',
        value: dimensionValue(name, product[name]), display: dimensionValue(name, product[name]) || 'No informado' })) })),
  };
}

/** Read-only server rendering; create/update/archive continue through the existing guarded JSON API. */
export class AdminProductsPage {
  constructor(private readonly catalog: Pick<CatalogAdmin, 'listProducts' | 'getProduct'>) {}

  async read(query: Record<string, unknown>) {
    const view = query.view ?? 'list';
    if (typeof view !== 'string' || !['list', 'create', 'detail', 'edit', 'variant-create', 'variant-edit'].includes(view)) throw new BadRequestException('Invalid product view');
    const keys = view === 'list' ? ['view', 'page', 'search', 'status', 'sort'] : view === 'create' ? ['view']
      : view === 'variant-edit' ? ['view', 'id', 'page', 'variantId'] : ['view', 'id', 'page'];
    if (Object.keys(query).some(key => !keys.includes(key))) throw new BadRequestException('Invalid product view query');
    if (view === 'list') {
      const parsed = parseAdminProductListQuery(query);
      const result = await this.catalog.listProducts({ page: String(parsed.page), limit: '24', ...(parsed.search ? { search: parsed.search } : {}),
        ...(parsed.status !== 'all' ? { status: parsed.status } : {}), ...(parsed.sort !== 'name_asc' ? { sort: parsed.sort } : {}) });
      const pages = Math.max(1, Math.ceil(result.total / 24));
      return { view: 'admin-products-list' as const, model: { ...model(), search: parsed.search ?? '', page: parsed.page, pages, total: result.total, singleResult: result.total === 1,
        listStatus: parsed.status, listSort: parsed.sort, filtered: !!parsed.search || parsed.status !== 'all', hasFilters: !!parsed.search || parsed.status !== 'all' || parsed.sort !== 'name_asc',
        statusOptions: [['all', 'Todos los estados'], ['active', 'Activos'], ['draft', 'Borradores'], ['archived', 'Archivados']].map(([value, label]) => ({ value, label, selected: value === parsed.status })),
        sortOptions: [['name_asc', 'Nombre: A–Z'], ['name_desc', 'Nombre: Z–A']].map(([value, label]) => ({ value, label, selected: value === parsed.sort })),
        firstItem: result.items.length ? (parsed.page - 1) * 24 + 1 : 0, lastItem: (parsed.page - 1) * 24 + result.items.length,
        hasPrevious: parsed.page > 1, hasNext: parsed.page < pages && parsed.page < 10000, previousPage: parsed.page - 1, nextPage: parsed.page + 1,
        items: result.items.map(productListItem) } };
    }
    if (view === 'create') return { view: 'admin-product-form' as const, model: { ...model(), title: 'Nuevo artículo' } };
    if (typeof query.id !== 'string' || !/^[-\x21-\x7e]{1,36}$/.test(query.id)) throw new BadRequestException('Invalid product identifier');
    if (view === 'variant-edit' && (typeof query.variantId !== 'string' || !/^[-\x21-\x7e]{1,36}$/.test(query.variantId))) throw new BadRequestException('Invalid variant identifier');
    const { page } = parseCatalogQuery({ page: query.page });
    const product = await this.catalog.getProduct(query.id, { page: String(page), limit: '24' });
    if (product.id !== query.id) throw new Error('Product identity changed');
    if (view !== 'detail' && product.archivedAt) throw new NotFoundException('Product not found');
    if (view === 'variant-create' || view === 'variant-edit') {
      const variant = view === 'variant-edit' ? product.variants.find(variant => variant.id === query.variantId && variant.productId === product.id) : undefined;
      if (view === 'variant-edit' && (!variant || variant.archivedAt)) throw new NotFoundException('Variant not found');
      const properties = groupProperties(product.propertyCatalog ?? product.variants.filter(v => !v.archivedAt).flatMap(v => [
        ...(v.colorName ? [{ name: 'Color', value: v.colorName }] : []), ...(v.options ?? [])]));
      const optionNames = properties.filter(p => p.name.toLocaleLowerCase('es') !== 'color').map(p => p.name);
      return { view: 'admin-variant-form' as const, model: { ...model(product), ...variantFormModel(variant, optionNames), propertyCatalog: JSON.stringify(properties), title: view === 'variant-edit' ? 'Editar variante' : 'Nueva variante', page } };
    }
    return { view: product.archivedAt ? 'admin-product-detail' as const : 'admin-product-form' as const,
      model: { ...model(product), title: product.name, editing: !product.archivedAt, editorView: view, page } };
  }
}
