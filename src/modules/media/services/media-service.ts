import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ImageOutputTooLarge, ImageProcessingBusy, processImage, type ImageWidth } from '../processing/image-processor';
import { claimMediaUpload } from '../http/media-upload.interceptor';
import { MediaRepository } from '../persistence/media-repository';

type Upload = { buffer: Buffer; size: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function plainAlt(value: unknown): string {
  if (typeof value !== 'string' || [...value].length > 300 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new BadRequestException('Invalid alt text');
  return value;
}
function exactBody(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, key)) throw new BadRequestException('Invalid image request');
  return value as Record<string, unknown>;
}

/** Binary content and its metadata are committed by the repository in one transaction. */
export class MediaService {
  private static uploading = false;
  constructor(private readonly repository: MediaRepository) {}
  list(productId: string) { return this.repository.list(productId); }
  async upload(productId: string, revision: number, key: string, file: Upload, alt: unknown) {
    const release = claimMediaUpload(file);
    if (MediaService.uploading) { release(); throw new HttpException('Too many uploads', 429); }
    MediaService.uploading = true;
    try { return await this.performUpload(productId, revision, key, file, alt); }
    finally { MediaService.uploading = false; release(); }
  }
  private async performUpload(productId: string, revision: number, key: string, file: Upload, alt: unknown) {
    if (typeof key !== 'string' || !uuid.test(key) || !file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size < 1 || file.size > 5 * 1024 * 1024) throw new BadRequestException('Invalid image upload');
    const text = plainAlt(alt);
    const digest = createHash('sha256').update(file.buffer).update('\0').update(text).digest('hex');
    let previous: Awaited<ReturnType<MediaRepository['findUpload']>>;
    try { previous = await this.repository.findUpload(productId, key, digest); }
    catch (error) { if (error instanceof HttpException) throw error; throw new ServiceUnavailableException('Image storage unavailable'); }
    if (previous) return previous;
    let processed: Awaited<ReturnType<typeof processImage>>;
    try { processed = await processImage(file.buffer); }
    catch (error) {
      if (error instanceof ImageProcessingBusy) throw new HttpException('Too many uploads', 429);
      if (error instanceof ImageOutputTooLarge) throw new HttpException('OUTPUT_TOO_LARGE', 413);
      throw new BadRequestException('Unsupported or invalid image');
    }
    try { return await this.repository.save(productId, revision, { id: randomUUID(), uploadKey:key, digest, alt:text, width:processed.width, height:processed.height }, processed.derivatives); }
    catch (error) { if (error instanceof HttpException) throw error; throw new ServiceUnavailableException('Image storage unavailable'); }
  }
  reorder(productId: string, revision: number, body: unknown) {
    const ids = exactBody(body, 'ids').ids;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new BadRequestException('Invalid image order');
    return this.repository.reorder(productId, revision, ids);
  }
  edit(productId: string, imageId: string, revision: number, body: unknown) {
    return this.repository.edit(productId, imageId, revision, plainAlt(exactBody(body, 'alt').alt));
  }
  retire(productId: string, imageId: string, revision: number) { return this.repository.retire(productId, imageId, revision); }
  restore(productId: string, imageId: string, revision: number) { return this.repository.restore(productId, imageId, revision); }
  async readAdmin(productId: string, imageId: string, width: ImageWidth) {
    const bytes = await this.repository.readAdmin(productId, imageId, width);
    if (!bytes) throw new NotFoundException('Image not found');
    return bytes;
  }
  async readPublic(imageId: string, width: ImageWidth) {
    const bytes = await this.repository.readPublic(imageId, width);
    if (!bytes) throw new NotFoundException('Image not found');
    return bytes;
  }
}
