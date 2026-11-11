import { BadRequestException, Body, Controller, Get, Header, Inject, Param, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { MediaUploadInterceptor } from '../../media/http/media-upload.interceptor';
import { CategoryPresentations, type CategoryUpload } from '../services/category-presentation';

@Controller('admin/catalog/categories') @UseGuards(CatalogGuard)
export class AdminCategoryPresentationController {
  constructor(@Inject(CategoryPresentations) private readonly categories: CategoryPresentations) {}
  @Put(':id/presentation') @UseInterceptors(MediaUploadInterceptor)
  save(@Param('id') id: string, @Body() body: unknown, @UploadedFile() file?: CategoryUpload) {
    if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || !('presentation' in body) || typeof body.presentation !== 'string') throw new BadRequestException('Invalid image fields');
    let input: unknown; try { input = JSON.parse(body.presentation); } catch { throw new BadRequestException('Invalid presentation'); }
    return this.categories.save(id, input, file);
  }
  @Get(':id/image/:version') @Header('Cache-Control', 'private, no-store') @Header('X-Content-Type-Options', 'nosniff')
  image(@Param('id') id: string, @Param('version') version: string) { return this.categories.image(id, version, false); }
}
@Controller('catalog/category-images')
export class PublicCategoryImageController {
  constructor(@Inject(CategoryPresentations) private readonly categories: CategoryPresentations) {}
  @Get(':id/:version') @Header('Cache-Control', 'no-store') @Header('X-Content-Type-Options', 'nosniff')
  image(@Param('id') id: string, @Param('version') version: string) { return this.categories.image(id, version, true); }
}
