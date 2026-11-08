import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { CatalogAdmin, CatalogProductInput, VariantInput, type VariantPriceInput } from '../services/catalog-admin';

const productKeys = ['name', 'slug', 'description', 'status', 'productWeightG', 'productWidthMm', 'productHeightMm', 'productLengthMm', 'packageWeightG', 'packageWidthMm', 'packageHeightMm', 'packageLengthMm', 'categoryId', 'bulkWarningThreshold', 'bulkWarningMessage'];
const variantKeys = ['sku', 'name', 'priceMinor', 'currency', 'supplyMode', 'materialId', 'colorId', 'options'];
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
  @Post('with-price') createWithPrice(@Body() body: unknown) {
    const input = bodyOf<{ product: unknown; price: unknown }>(body, ['product', 'price']);
    return this.catalog.createProductWithPrice(bodyOf<CatalogProductInput>(input.product, productKeys), bodyOf<VariantPriceInput>(input.price, ['priceMinor', 'currency', 'supplyMode', 'costMinor', 'stockQuantity']));
  }
  @Post(':id/publish') @HttpCode(200) publish(@Param('id') id: string) { return this.catalog.publishProduct(id); }
  @Post(':id/unpublish') @HttpCode(200) unpublish(@Param('id') id: string) { return this.catalog.unpublishProduct(id); }
  @Put(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.catalog.updateProduct(id, bodyOf<CatalogProductInput>(body, productKeys)); }
  @Delete(':id') archive(@Param('id') id: string) { return this.catalog.archiveProduct(id); }
  @Post(':id/variants') createVariant(@Param('id') id: string, @Body() body: unknown) { return this.catalog.createVariant(id, bodyOf<VariantInput>(body, [...variantKeys, 'costMinor', 'stockQuantity'])); }
  @Put(':id/variants/:variantId/pricing') saveVariantPricing(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) {
    return this.catalog.saveVariantPricing(id, variantId, body);
  }
  @Put(':id/variants/:variantId/image') saveVariantImage(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) {
    return this.catalog.saveVariantImage(id, variantId, body);
  }
  @Put(':id/variants/:variantId') updateVariant(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) { return this.catalog.updateVariant(id, variantId, bodyOf<VariantInput>(body, variantKeys)); }
  @Put(':id/variants/:variantId/price') updateVariantPrice(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) {
    return this.catalog.updateVariantPrice(id, variantId, bodyOf<VariantPriceInput>(body, ['priceMinor', 'currency', 'supplyMode']));
  }
  @Delete(':id/variants/:variantId') archiveVariant(@Param('id') id: string, @Param('variantId') variantId: string) { return this.catalog.archiveVariant(id, variantId); }
  @Put(':id/variants/:variantId/stock') updateVariantStock(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) {
    return this.catalog.updateVariantStock(id, variantId, body);
  }
  @Put(':id/variants/:variantId/quick-adjustment') adjustVariant(@Param('id') id: string, @Param('variantId') variantId: string, @Body() body: unknown) {
    return this.catalog.adjustVariant(id, variantId, body);
  }
}
