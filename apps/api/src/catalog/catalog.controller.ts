import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { PublicCatalog } from './public-catalog';

@Controller('catalog')
export class CatalogController {
  constructor(@Inject(PublicCatalog) private readonly catalog: PublicCatalog) {}
  @Get('products')
  list(@Query() query: Record<string, unknown>) { return this.catalog.list(query); }
  @Get('products/:slug')
  detail(@Param('slug') slug: string, @Query() query: Record<string, unknown>) { return this.catalog.detail(slug, query); }
  @Get('settings')
  settings() { return this.catalog.settings(); }
}
