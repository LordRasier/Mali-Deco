import { BadRequestException, Body, Controller, Get, Header, HttpException, Inject, NotFoundException, Param, Post, ServiceUnavailableException, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/http/owner.guard';
import { claimMediaUpload, MediaUploadInterceptor } from '../media/http/media-upload.interceptor';
import { ImageOutputTooLarge, ImageProcessingBusy, processImage } from '../media/processing/image-processor';
import { ContentSettings } from './content-settings';
import { flattenBlocks } from '../../shared/landing-layout';
type Upload = { buffer: Buffer; size: number };
export class ContentMedia {
  constructor(private readonly content: Pick<ContentSettings, 'get'>, private readonly db?: DataSource) {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Content media unavailable'); return this.db; }
  async read(id: string, published: boolean) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)) throw new NotFoundException();
    if (published) {
      const url = '/api/v1/catalog/content-media/' + id;
      if (!flattenBlocks((await this.content.get()).settings.landing).some(b => b.props.image === url || b.props.mobileImage === url)) throw new NotFoundException();
    }
    const rows: { data: Buffer }[] = await this.database().query('SELECT data FROM store_content_media WHERE id = ?', [id]);
    if (!rows[0]) throw new NotFoundException(); return new StreamableFile(rows[0].data, { type: 'image/webp' });
  }
  async upload(file?: Upload) {
    const release = claimMediaUpload(file);
    try {
      if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size < 1 || file.size > 5 * 1024 * 1024) throw new BadRequestException('Invalid image upload');
      let data: Buffer;
      try { data = (await processImage(file.buffer)).derivatives[1600]; if (data.length > 1024 * 1024) throw new ImageOutputTooLarge(); }
      catch (error) { if (error instanceof ImageProcessingBusy) throw new HttpException('Too many uploads', 429); if (error instanceof ImageOutputTooLarge) throw new HttpException('Image too large', 413); throw new BadRequestException('Unsupported or invalid image'); }
      const id = randomUUID();
      try { await this.database().query('INSERT INTO store_content_media (id, data) VALUES (?, ?)', [id, data]); }
      catch (error) { if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') throw new ServiceUnavailableException('Apply content media migration'); throw error; }
      return { id, url: '/api/v1/catalog/content-media/' + id };
    } finally { release(); }
  }
}
@Controller('admin/settings/content/media') @UseGuards(OwnerGuard)
export class AdminContentMediaController {
  constructor(@Inject(ContentMedia) private readonly media: ContentMedia) {}
  @Post() @UseInterceptors(MediaUploadInterceptor)
  upload(@UploadedFile() file: Upload | undefined, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Object.keys(body).length) throw new BadRequestException('Invalid image fields');
    return this.media.upload(file);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') @Header('X-Content-Type-Options', 'nosniff')
  read(@Param('id') id: string) { return this.media.read(id, false); }
}
@Controller('catalog/content-media')
export class PublicContentMediaController {
  constructor(@Inject(ContentMedia) private readonly media: ContentMedia) {}
  @Get(':id') @Header('Cache-Control', 'no-store') @Header('X-Content-Type-Options', 'nosniff')
  read(@Param('id') id: string) { return this.media.read(id, true); }
}
