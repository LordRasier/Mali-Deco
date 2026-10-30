import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CatalogGuard } from '../identity/catalog.guard';
import { CatalogAdmin, CatalogProductInput, VariantInput } from './catalog-admin';

const productKeys = ['name', 'slug', 'description', 'status', 'productWeightG', 'productWidthMm', 'productHeightMm', 'productLengthMm', 'packageWeightG', 'packageWidthMm', 'packageHeightMm', 'packageLengthMm', 'categoryId'];
const variantKeys = ['sku', 'name', 'priceMinor', 'currency', 'supplyMode', 'materialId', 'colorId'];
function bodyOf<T>(body: unknown, allowed: string[]): T {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) throw new BadRequestException('Invalid request body');
  return body as T;
}

@Controller('admin/catalog/products')
@UseGuards(CatalogGuard)
export class AdminCatalogController {
  constructor(@Inject(CatalogAdmin) private readonly catalog: CatalogAdmin) {}
  @Get() list(@Query() query: Record<string, unknown>) { return this.catalog.listProducts(query); }
  @Get(':id') get(@Param('id') id: string, @Query() query: Record<string, unknown>) { return this.catalog.getProduct(id, query); }
  @Post() create(@Body() body: unknown) { return this.catalog.createProduct(bodyOf<CatalogProductInput>(body, productKeys)); }
  @Put(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.catalog.updateProduct(id, bodyOf<CatalogProductInput>(body, productKeys)); }
  @Delete(':id') archive(@Param('id') id: string) { return this.catalog.archiveProduct(id); }
  @Post(':id/variants') createVariant(@Param('id') id: string, @Body() body: unknown) { return this.catalog.createVariant(id, bodyOf<VariantInput>(body, variantKeys)); }
  @Put(':id/variants/:variantId') updateVariant(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) { return this.catalog.updateVariant(id, variantId, bodyOf<VariantInput>(body, variantKeys)); }
  @Delete(':id/variants/:variantId') archiveVariant(@Param('id') id: string, @Param('variantId') variantId: string) { return this.catalog.archiveVariant(id, variantId); }
}
