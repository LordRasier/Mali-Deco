import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { ImageDerivatives, ImageWidth } from '../processing/image-processor';

export interface MediaInput { id: string; uploadKey: string; digest: string; alt: string; width: number; height: number }
export interface MediaItem { id: string; alt: string; width: number; height: number; position: number; retired: boolean }
export interface MediaList { revision: number; items: MediaItem[] }
type Product = { media_revision: number; archived_at: Date | null; status: string };
type Row = { id: string; alt: string; width: number; height: number; position: number; retired_at: Date | null; upload_digest?: string };
type Queryable = Pick<EntityManager, 'query'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(id: unknown): asserts id is string { if (typeof id !== 'string' || !uuid.test(id)) throw new BadRequestException('Invalid UUID'); }
function validAlt(alt: unknown): asserts alt is string {
  if (typeof alt !== 'string' || [...alt].length > 300 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(alt)) throw new BadRequestException('Invalid alt');
}
function validRevision(revision: unknown): asserts revision is number {
  if (!Number.isInteger(revision) || (revision as number) < 0 || (revision as number) > 4294967295) throw new BadRequestException('Invalid revision');
}
function checkRevision(product: Product, revision: number) {
  if (Number(product.media_revision) !== revision) throw new HttpException('Media revision mismatch', 412);
}
function dto(rows: Row[], revision: number): MediaList {
  return { revision: Number(revision), items: rows.map(row => ({ id: row.id, alt: row.alt, width: row.width, height: row.height, position: row.position, retired: row.retired_at !== null })) };
}

export class MediaRepository {
  constructor(private readonly db?: DataSource, private readonly quotaBytes = 128 * 1024 * 1024) {
    if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0) throw new Error('Invalid media quota');
  }
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Media database unavailable');
    return this.db;
  }
  private async product(db: Queryable, id: string, lock = false): Promise<Product> {
    const rows: Product[] = await db.query(`SELECT media_revision, archived_at, status FROM products WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!rows[0]) throw new NotFoundException('Product not found');
    return rows[0];
  }
  private async rows(db: Queryable, productId: string): Promise<Row[]> {
    return db.query('SELECT id, alt, width, height, position, retired_at FROM product_images WHERE product_id = ? ORDER BY retired_at IS NOT NULL, position, id', [productId]);
  }
  async list(productId: string): Promise<MediaList> {
    validId(productId);
    const db = this.database();
    // A consistent snapshot prevents pairing rows with a different revision.
    return db.transaction('REPEATABLE READ', async manager => {
      const product = await this.product(manager, productId);
      return dto(await this.rows(manager, productId), product.media_revision);
    });
  }
  private async mutate<T>(productId: string, fn: (manager: EntityManager, product: Product) => Promise<T>): Promise<T> {
    validId(productId);
    return this.database().transaction(async manager => {
      const product = await this.product(manager, productId, true);
      if (product.archived_at !== null) throw new NotFoundException('Product not found');
      return fn(manager, product);
    });
  }
  private async changed(manager: EntityManager, productId: string, product: Product): Promise<MediaList> {
    await manager.query('UPDATE products SET media_revision = media_revision + 1 WHERE id = ?', [productId]);
    return dto(await this.rows(manager, productId), Number(product.media_revision) + 1);
  }
  async findUpload(productId: string, uploadKey: string, digest: string): Promise<(MediaList & { replay: true; imageId: string }) | null> {
    validId(uploadKey);
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new BadRequestException('Invalid digest');
    return this.mutate(productId, async (manager, product) => {
      const previous: Row[] = await manager.query('SELECT id, upload_digest FROM product_images WHERE product_id = ? AND upload_key = ?', [productId, uploadKey]);
      if (!previous.length) return null;
      if (previous[0].upload_digest !== digest) throw new ConflictException('Upload key already used');
      return { ...dto(await this.rows(manager, productId), product.media_revision), replay: true, imageId: previous[0].id };
    });
  }
  async save(productId: string, revision: number, input: MediaInput, derivatives: ImageDerivatives): Promise<MediaList & { replay: boolean; imageId: string }> {
    validRevision(revision);
    if (!input || typeof input !== 'object') throw new BadRequestException('Invalid image');
    validId(input.id); validId(input.uploadKey); validAlt(input.alt);
    if (typeof input.digest !== 'string' || !/^[0-9a-f]{64}$/.test(input.digest) || !Number.isInteger(input.width) || input.width < 1 || input.width > 4294967295 || !Number.isInteger(input.height) || input.height < 1 || input.height > 4294967295) throw new BadRequestException('Invalid image');
    return this.mutate(productId, async (manager, product) => {
      const previous: Row[] = await manager.query('SELECT id, upload_digest FROM product_images WHERE product_id = ? AND upload_key = ?', [productId, input.uploadKey]);
      if (previous.length) {
        if (previous[0].upload_digest !== input.digest) throw new ConflictException('Upload key already used');
        return { ...dto(await this.rows(manager, productId), product.media_revision), replay: true, imageId: previous[0].id };
      }
      checkRevision(product, revision);
      const rows = await this.rows(manager, productId);
      const active = rows.filter(row => row.retired_at === null);
      if (active.length >= 10) throw new ConflictException('Image limit reached');
      const widths: ImageWidth[] = [320, 800, 1600];
      if (!derivatives || widths.some(width => !Buffer.isBuffer(derivatives[width]) || derivatives[width].length < 1 || derivatives[width].length > 384 * 1024) || Object.keys(derivatives).length !== 3) throw new BadRequestException('Invalid image derivatives');
      const total = widths.reduce((sum, width) => sum + derivatives[width].length, 0);
      if (total > 1024 * 1024) throw new BadRequestException('Image derivatives too large');
      const quota: Array<{ id: number }> = await manager.query('SELECT id FROM product_image_quota WHERE id = 1 FOR UPDATE');
      if (quota.length !== 1) throw new ServiceUnavailableException('Media quota unavailable');
      const used: Array<{ total: string | number }> = await manager.query('SELECT COALESCE(SUM(byte_length), 0) AS total FROM product_image_derivatives FOR UPDATE');
      const current = Number(used[0]?.total);
      if (!Number.isSafeInteger(current) || current < 0) throw new ServiceUnavailableException('Media quota unavailable');
      if (current + total > this.quotaBytes) throw new ConflictException('MEDIA_QUOTA_EXCEEDED');
      const packet: Array<{ maxPacket: string | number }> = await manager.query('SELECT @@SESSION.max_allowed_packet AS maxPacket');
      const maxPacket = Number(packet[0]?.maxPacket);
      if (!Number.isSafeInteger(maxPacket) || widths.some(width => derivatives[width].length * 2 + 64 * 1024 > maxPacket)) throw new ServiceUnavailableException('MEDIA_PACKET_TOO_SMALL');
      const position = active.reduce((max, row) => Math.max(max, row.position), -1) + 1;
      try {
        await manager.query('INSERT INTO product_images (id, product_id, upload_key, upload_digest, alt, width, height, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [input.id, productId, input.uploadKey, input.digest, input.alt, input.width, input.height, position]);
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new ConflictException('Image already exists');
        throw error;
      }
      for (const width of widths) await manager.query('INSERT INTO product_image_derivatives (image_id, rendition, byte_length, data) VALUES (?, ?, ?, ?)', [input.id, width, derivatives[width].length, derivatives[width]]);
      return { ...await this.changed(manager, productId, product), replay: false, imageId: input.id };
    });
  }
  async reorder(productId: string, revision: number, ids: string[]): Promise<MediaList> {
    validRevision(revision);
    if (!Array.isArray(ids)) throw new BadRequestException('Invalid image order');
    ids.forEach(validId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate image');
    return this.mutate(productId, async (manager, product) => {
      checkRevision(product, revision);
      const active = (await this.rows(manager, productId)).filter(row => row.retired_at === null);
      if (active.length !== ids.length || ids.some(id => !active.some(row => row.id === id))) throw new BadRequestException('Order must include every active image');
      for (let position = 0; position < ids.length; position++) await manager.query('UPDATE product_images SET position = ? WHERE product_id = ? AND id = ?', [position, productId, ids[position]]);
      return this.changed(manager, productId, product);
    });
  }
  async edit(productId: string, imageId: string, revision: number, alt: string): Promise<MediaList> {
    validId(imageId); validRevision(revision); validAlt(alt);
    return this.updateImage(productId, imageId, revision, 'edit', alt);
  }
  async retire(productId: string, imageId: string, revision: number): Promise<MediaList> {
    validId(imageId); validRevision(revision);
    return this.updateImage(productId, imageId, revision, 'retire');
  }
  async restore(productId: string, imageId: string, revision: number): Promise<MediaList> {
    validId(imageId); validRevision(revision);
    return this.updateImage(productId, imageId, revision, 'restore');
  }
  private async updateImage(productId: string, imageId: string, revision: number, action: 'edit' | 'retire' | 'restore', alt?: string): Promise<MediaList> {
    return this.mutate(productId, async (manager, product) => {
      checkRevision(product, revision);
      const rows = await this.rows(manager, productId);
      const image = rows.find(row => row.id === imageId);
      if (!image || (action === 'retire' && image.retired_at !== null) || (action === 'restore' && image.retired_at === null)) throw new NotFoundException('Image not found');
      if (action === 'edit') await manager.query('UPDATE product_images SET alt = ? WHERE product_id = ? AND id = ?', [alt, productId, imageId]);
      if (action === 'retire') {
        await manager.query('UPDATE product_images SET retired_at = CURRENT_TIMESTAMP(6) WHERE product_id = ? AND id = ?', [productId, imageId]);
        await manager.query('UPDATE product_variants SET image_id = NULL WHERE product_id = ? AND image_id = ?', [productId, imageId]);
      }
      if (action === 'restore') {
        const active = rows.filter(row => row.retired_at === null);
        if (active.length >= 10) throw new ConflictException('Image limit reached');
        const derivatives: Array<{ rendition: number; byte_length: number }> = await manager.query('SELECT rendition, byte_length FROM product_image_derivatives WHERE image_id = ?', [imageId]);
        if (derivatives.length !== 3 || [320, 800, 1600].some(width => !derivatives.some(row => Number(row.rendition) === width && Number(row.byte_length) > 0 && Number(row.byte_length) <= 384 * 1024)) || derivatives.reduce((sum, row) => sum + Number(row.byte_length), 0) > 1024 * 1024) throw new ConflictException('Image derivatives unavailable');
        const position = active.reduce((max, row) => Math.max(max, row.position), -1) + 1;
        await manager.query('UPDATE product_images SET retired_at = NULL, position = ? WHERE product_id = ? AND id = ?', [position, productId, imageId]);
      }
      return this.changed(manager, productId, product);
    });
  }
  // Callers must enforce authorization before using preview access.
  async imageAccess(productId: string, imageId: string): Promise<{ public: boolean; preview: boolean }> {
    validId(productId); validId(imageId);
    const rows: Array<{ status: string; archived_at: Date | null; retired_at: Date | null }> = await this.database().query('SELECT p.status, p.archived_at, i.retired_at FROM product_images i JOIN products p ON p.id = i.product_id WHERE i.product_id = ? AND i.id = ?', [productId, imageId]);
    const row = rows[0];
    return { public: !!row && row.archived_at === null && row.retired_at === null && row.status === 'active', preview: !!row };
  }
  async publicImageAccess(imageId: string): Promise<{ productId: string } | null> {
    validId(imageId);
    const rows: Array<{ productId: string }> = await this.database().query(`SELECT i.product_id AS productId FROM product_images i
      JOIN products p ON p.id = i.product_id WHERE i.id = ? AND i.retired_at IS NULL
      AND p.archived_at IS NULL AND p.status = 'active'`, [imageId]);
    return rows[0] ?? null;
  }
  async readPublic(imageId: string, width: ImageWidth): Promise<Buffer | null> {
    validId(imageId); this.validWidth(width);
    const rows: Array<{ data: Buffer }> = await this.database().query(`SELECT d.data FROM product_image_derivatives d
      JOIN product_images i ON i.id = d.image_id JOIN products p ON p.id = i.product_id
      WHERE i.id = ? AND d.rendition = ? AND i.retired_at IS NULL AND p.archived_at IS NULL AND p.status = 'active'`, [imageId, width]);
    return rows[0]?.data ?? null;
  }
  // The caller must authorize administrative access before invoking this method.
  async readAdmin(productId: string, imageId: string, width: ImageWidth): Promise<Buffer | null> {
    validId(productId); validId(imageId); this.validWidth(width);
    const rows: Array<{ data: Buffer }> = await this.database().query(`SELECT d.data FROM product_image_derivatives d
      JOIN product_images i ON i.id = d.image_id WHERE i.product_id = ? AND i.id = ? AND d.rendition = ?`, [productId, imageId, width]);
    return rows[0]?.data ?? null;
  }
  private validWidth(width: unknown): asserts width is ImageWidth {
    if (width !== 320 && width !== 800 && width !== 1600) throw new BadRequestException('Invalid rendition');
  }
}
