import { BadRequestException, Body, Controller, Get, HttpException, Inject, Param, Put, Res, ServiceUnavailableException, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import sharp from 'sharp';
import { OwnerGuard } from '../identity/http/owner.guard';
import { claimMediaUpload, MediaUploadInterceptor } from '../media/http/media-upload.interceptor';
import { ImageOutputTooLarge, ImageProcessingBusy, processImage } from '../media/processing/image-processor';

type Kind = 'logo' | 'icon' | 'hero' | 'about';
type Upload = { buffer: Buffer; size: number };
const transparent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==', 'base64');
function kind(value: string): Kind { if (value !== 'logo' && value !== 'icon' && value !== 'hero' && value !== 'about') throw new BadRequestException('Invalid brand asset'); return value; }

export class BrandAssets {
  constructor(private readonly db?: DataSource) {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Brand storage unavailable'); return this.db; }
  async read(value: 'logo' | 'icon'): Promise<Buffer>;
  async read(value: string): Promise<Buffer | null>;
  async read(value: string): Promise<Buffer | null> {
    const key = kind(value);
    let rows: Array<{ data: Buffer }>;
    try { rows = await this.database().query('SELECT data FROM store_brand_assets WHERE kind = ?', [key]); }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ER_NO_SUCH_TABLE') throw error;
      rows = [];
    }
    return rows[0]?.data ?? (key === 'hero' || key === 'about' ? null : transparent);
  }
  async upload(value: string, file?: Upload): Promise<{ saved: true }> {
    const release = claimMediaUpload(file);
    try {
      const key = kind(value);
      if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size < 1 || file.size > 5 * 1024 * 1024) throw new BadRequestException('Invalid image upload');
      let data: Buffer;
      try {
        const processed = await processImage(file.buffer);
        data = key === 'hero' || key === 'about' ? processed.derivatives[1600] : await sharp(processed.derivatives[320]).resize({ width: key === 'icon' ? 64 : 320, height: key === 'icon' ? 64 : 320, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        if (data.length > 1024 * 1024) throw new ImageOutputTooLarge();
      } catch (error) {
        if (error instanceof ImageProcessingBusy) throw new HttpException('Too many uploads', 429);
        if (error instanceof ImageOutputTooLarge) throw new HttpException('Image too large', 413);
        throw new BadRequestException('Unsupported or invalid image');
      }
      await this.database().query('INSERT INTO store_brand_assets (kind, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)', [key, data]);
      return { saved: true };
    } finally { release(); }
  }
}

@Controller('admin/settings/branding')
@UseGuards(OwnerGuard)
export class AdminBrandAssetsController {
  constructor(@Inject(BrandAssets) private readonly assets: BrandAssets) {}
  @Put(':kind') @UseInterceptors(MediaUploadInterceptor)
  upload(@Param('kind') value: string, @UploadedFile() file: Upload | undefined, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Object.keys(body).length !== 0) throw new BadRequestException('Invalid image fields');
    return this.assets.upload(value, file);
  }
}

@Controller('catalog/branding')
export class PublicBrandAssetsController {
  constructor(@Inject(BrandAssets) private readonly assets: BrandAssets) {}
  @Get(':kind') async read(@Param('kind') value: string, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void; redirect(status: number, path: string): void }) {
    const data = await this.assets.read(value);
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!data) { response.redirect(302, value === 'hero' ? '/storefront/hero-3d-objects.webp' : '/storefront/organizador-arco.webp'); return; }
    response.setHeader('Content-Type', value === 'hero' || value === 'about' ? 'image/webp' : 'image/png');
    return new StreamableFile(data);
  }
}
