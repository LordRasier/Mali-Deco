import { BadRequestException, Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../../../modules/identity/http/owner.guard';
import { PublicCatalog } from '../../../modules/catalog/services/public-catalog';
import { PublicFacets } from '../../../modules/catalog/services/public-facets';
@Controller('admin/settings/content/choices') @UseGuards(OwnerGuard)
export class ContentChoicesController {
  constructor(@Inject(PublicCatalog) private readonly catalog: PublicCatalog, @Inject(PublicFacets) private readonly facets: PublicFacets) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  async read(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some(k => !['search', 'page', 'ids'].includes(k))) throw new BadRequestException();
    if (query.ids !== undefined && (typeof query.ids !== 'string' || !/^[a-zA-Z0-9_,-]{0,1944}$/.test(query.ids) || query.ids.split(',').length > 24)) throw new BadRequestException();
    const [products, facets] = await Promise.all([query.ids !== undefined ? this.catalog.selected(String(query.ids).split(',').filter(Boolean)) : this.catalog.list({ limit: '24', ...(query.search ? { search: query.search } : {}), ...(query.page ? { page: query.page } : {}) }), this.facets.get()]);
    return { products: products.items.map(p => ({ id: p.id, name: p.name })), total: products.total, categories: facets.categories.map(c => ({ id: c.id, slug: c.slug, name: c.name })) };
  }
}
