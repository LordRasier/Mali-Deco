import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpException, Inject, Param, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { MediaService } from '../services/media-service';
import type { ImageWidth } from '../processing/image-processor';
import { MediaUploadInterceptor } from './media-upload.interceptor';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value: string): string { if (!uuid.test(value)) throw new BadRequestException('Invalid identifier'); return value; }
function revision(value: string | undefined): number {
  if (value === undefined) throw new HttpException('If-Match required', 428);
  if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 4294967295) throw new BadRequestException('Invalid If-Match');
  return Number(value);
}
function width(value: unknown): ImageWidth {
  if (value !== '320' && value !== '800' && value !== '1600') throw new BadRequestException('Invalid width');
  return Number(value) as ImageWidth;
}
function object(body: unknown, keys: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) throw new BadRequestException('Invalid body');
  return body as Record<string, unknown>;
}
type Response = { setHeader(name: string, value: string): unknown };
function imageHeaders(response: Response): void {
  response.setHeader('Content-Type', 'image/webp');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
}

@Controller('admin/catalog/products/:productId/images')
@UseGuards(CatalogGuard)
export class AdminMediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}
  @Get() list(@Param('productId') productId: string) { return this.media.list(id(productId)); }
  @Get(':imageId/content') async content(@Param('productId') productId: string, @Param('imageId') imageId: string, @Query('w') w: unknown, @Res({ passthrough: true }) res: Response) {
    const bytes = await this.media.readAdmin(id(productId), id(imageId), width(w)); imageHeaders(res); return new StreamableFile(bytes);
  }
  @Post() @UseInterceptors(MediaUploadInterceptor)
  upload(@Param('productId') productId: string, @Headers('if-match') match: string | undefined, @Headers('idempotency-key') key: string | undefined, @UploadedFile() file: { buffer: Buffer; size: number } | undefined, @Body() body: unknown) {
    const rev = revision(match);
    if (!key || !uuidV4.test(key)) throw new BadRequestException('Invalid Idempotency-Key');
    const fields = object(body, ['alt']);
    if (typeof fields.alt !== 'string' || !file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size > 5 * 1024 * 1024) throw new BadRequestException('Invalid upload');
    return this.media.upload(id(productId), rev, key, file, fields.alt);
  }
  @Put('order') reorder(@Param('productId') productId: string, @Headers('if-match') match: string | undefined, @Body() body: unknown) {
    return this.media.reorder(id(productId), revision(match), object(body, ['ids']));
  }
  @Put(':imageId') edit(@Param('productId') productId: string, @Param('imageId') imageId: string, @Headers('if-match') match: string | undefined, @Body() body: unknown) {
    return this.media.edit(id(productId), id(imageId), revision(match), object(body, ['alt']));
  }
  @Delete(':imageId') retire(@Param('productId') productId: string, @Param('imageId') imageId: string, @Headers('if-match') match: string | undefined) { return this.media.retire(id(productId), id(imageId), revision(match)); }
  @Post(':imageId/restore') restore(@Param('productId') productId: string, @Param('imageId') imageId: string, @Headers('if-match') match: string | undefined) { return this.media.restore(id(productId), id(imageId), revision(match)); }
}

@Controller('catalog/images')
export class PublicMediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}
  @Get(':imageId') async content(@Param('imageId') imageId: string, @Query('w') w: unknown, @Res({ passthrough: true }) res: Response) {
    const bytes = await this.media.readPublic(id(imageId), width(w)); imageHeaders(res); return new StreamableFile(bytes);
  }
}
