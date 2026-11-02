import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CatalogGuard } from '../identity/catalog.guard';
import { CatalogTaxonomy, TaxonomyGroup, TaxonomyInput } from './catalog-taxonomy';

// Concrete routes prevent a dynamic taxonomy route from capturing /products.
abstract class AdminTaxonomyRoutes {
  protected abstract readonly group: TaxonomyGroup;
  constructor(protected readonly taxonomy: CatalogTaxonomy) {}
  @Get() list(@Query() query: Record<string, unknown>) { return this.taxonomy.list(this.group, query); }
  @Post() create(@Body() body: TaxonomyInput) { return this.taxonomy.create(this.group, body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: TaxonomyInput) { return this.taxonomy.update(this.group, id, body); }
  @Delete(':id') archive(@Param('id') id: string) { return this.taxonomy.archive(this.group, id); }
}
@Controller('admin/catalog/categories') @UseGuards(CatalogGuard)
export class AdminCategoriesController extends AdminTaxonomyRoutes {
  protected readonly group = 'categories' as const;
  constructor(@Inject(CatalogTaxonomy) taxonomy: CatalogTaxonomy) { super(taxonomy); }
}
@Controller('admin/catalog/materials') @UseGuards(CatalogGuard)
export class AdminMaterialsController extends AdminTaxonomyRoutes {
  protected readonly group = 'materials' as const;
  constructor(@Inject(CatalogTaxonomy) taxonomy: CatalogTaxonomy) { super(taxonomy); }
}
@Controller('admin/catalog/colors') @UseGuards(CatalogGuard)
export class AdminColorsController extends AdminTaxonomyRoutes {
  protected readonly group = 'colors' as const;
  constructor(@Inject(CatalogTaxonomy) taxonomy: CatalogTaxonomy) { super(taxonomy); }
}
