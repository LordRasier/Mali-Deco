import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { categoryIcons, defaultCategoryPresentation, parseCategoryPresentation, type CategoryIcon, type CategoryPresentation } from '../../../shared/category-presentation';
import { claimMediaUpload } from '../../media/http/media-upload.interceptor';
import { ImageOutputTooLarge, ImageProcessingBusy, processImage } from '../../media/processing/image-processor';

export type CategoryUpload = { buffer: Buffer; size: number };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Row = { id: string; description: string; icon: CategoryIcon; imageAlt: string; version: string | null };
const projection = (row?: Row): CategoryPresentation => row ? { description: row.description, imageAlt: row.imageAlt,
  icon: Object.hasOwn(categoryIcons, row.icon) ? row.icon : 'grid', image: row.version ? `/api/v1/catalog/category-images/${row.id}/${row.version}` : '' } : defaultCategoryPresentation();

export class CategoryPresentations {
  constructor(private readonly db?: DataSource) {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable'); return this.db; }
  async decorate<T extends { id: string }>(items: T[]): Promise<Array<T & { presentation?: CategoryPresentation }>> {
    if (!items.length) return items;
    let rows: Row[];
    try { rows = await this.database().query(`SELECT category_id AS id, description, icon, image_alt AS imageAlt, image_version AS version
      FROM category_presentations WHERE category_id IN (${items.map(() => '?').join(',')})`, items.map(item => item.id)); }
    catch (error) { if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error; rows = []; }
    const byId = new Map(rows.map(row => [row.id, row]));
    return items.map(item => ({ ...item, presentation: projection(byId.get(item.id)) }));
  }
  async save(id: string, input: unknown, file?: CategoryUpload) {
    const release = claimMediaUpload(file);
    try {
      if (!uuid.test(id)) throw new NotFoundException();
      let values: ReturnType<typeof parseCategoryPresentation>;
      try { values = parseCategoryPresentation(input); } catch { throw new BadRequestException('Invalid category presentation'); }
      if (file && values.removeImage) throw new BadRequestException('Conflicting image changes');
      let image: Buffer | undefined;
      if (file) {
        if (!Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size < 1 || file.size > 5 * 1024 * 1024) throw new BadRequestException('Invalid image upload');
        try { image = (await processImage(file.buffer)).derivatives[800]; if (image.length > 1024 * 1024) throw new ImageOutputTooLarge(); }
        catch (error) { if (error instanceof ImageProcessingBusy) throw new HttpException('Too many uploads', 429); if (error instanceof ImageOutputTooLarge) throw new HttpException('Image too large', 413); throw new BadRequestException('Unsupported or invalid image'); }
      }
      try {
        return await this.database().transaction(async manager => {
          const categories: unknown[] = await manager.query('SELECT id FROM categories WHERE id = ? AND archived_at IS NULL FOR UPDATE', [id]);
          if (!categories.length) throw new NotFoundException('Category not found');
          await manager.query(`INSERT INTO category_presentations (category_id, description, icon, image_alt) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE description = VALUES(description), icon = VALUES(icon), image_alt = VALUES(image_alt)`, [id, values.description, values.icon, values.imageAlt]);
          if (image || values.removeImage) await manager.query('UPDATE category_presentations SET image_data = ?, image_version = ? WHERE category_id = ?', [image ?? null, image ? randomUUID() : null, id]);
          const [row]: Row[] = await manager.query('SELECT category_id AS id, description, icon, image_alt AS imageAlt, image_version AS version FROM category_presentations WHERE category_id = ?', [id]);
          return { id, presentation: projection(row) };
        });
      } catch (error) { if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') throw new ServiceUnavailableException('Apply category presentation migration'); throw error; }
    } finally { release(); }
  }
  async image(id: string, version: string, published: boolean) {
    if (!uuid.test(id) || !uuid.test(version)) throw new NotFoundException();
    const rows: { data: Buffer }[] = await this.database().query(`SELECT a.image_data AS data FROM category_presentations a
      JOIN categories c ON c.id = a.category_id WHERE c.id = ? AND c.archived_at IS NULL AND a.image_version = ? AND a.image_data IS NOT NULL
      ${published ? "AND EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.status = 'active' AND p.archived_at IS NULL)" : ''}`, [id, version]);
    if (!rows[0]) throw new NotFoundException();
    return new StreamableFile(rows[0].data, { type: 'image/webp' });
  }
}
