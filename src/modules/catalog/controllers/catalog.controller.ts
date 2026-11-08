import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { PublicCatalog } from '../services/public-catalog';
import { PublicFacets } from '../services/public-facets';

@Controller('catalog')
export class CatalogController {
  constructor(@Inject(PublicCatalog) private readonly catalog: PublicCatalog, @Inject(PublicFacets) private readonly facets: PublicFacets) {}
  @Get('products')
  list(@Query() query: Record<string, unknown>) { return this.catalog.list(query); }
  @Get('products/:slug')
  detail(@Param('slug') slug: string, @Query() query: Record<string, unknown>) { return this.catalog.detail(slug, query); }
  @Get('facets')
  getFacets(@Query() query: Record<string, unknown>) { return this.facets.get(query); }
  @Get('settings')
  settings() { return this.catalog.settings(); }
}
