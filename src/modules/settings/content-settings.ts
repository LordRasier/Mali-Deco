import { BadRequestException, Body, ConflictException, Controller, Get, Header, Inject, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/http/owner.guard';
import { defaultContentConfig, type ContentConfig } from './content-config';
import { normalizeSections, parseContentConfig, parseStoredContentConfig } from './content-validation';

export type ContentSnapshot = { settings: ContentConfig; revision: number; available: boolean };
const missingTable = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ER_NO_SUCH_TABLE';
export class ContentSettings {
  constructor(private readonly db?: DataSource) {}
  async get(): Promise<ContentSnapshot> {
    if (!this.db) return { settings: normalizeSections(defaultContentConfig()), revision: 0, available: false };
    if (!this.db.isInitialized) throw new ServiceUnavailableException('El contenido no está disponible en este momento.');
    try {
      const [row] = await this.db.query('SELECT config, revision FROM store_content_settings WHERE id = 1');
      return { settings: row ? parseStoredContentConfig(JSON.parse(row.config)) : normalizeSections(defaultContentConfig()), revision: Number(row?.revision ?? 0), available: true };
    } catch (error) {
      if (missingTable(error)) return { settings: normalizeSections(defaultContentConfig()), revision: 0, available: false };
      // Never reactivate disabled pages by falling back to defaults on a database failure.
      throw new ServiceUnavailableException('El contenido no está disponible en este momento.');
    }
  }
  async set(body: unknown): Promise<ContentSnapshot> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['settings', 'revision'].includes(k))) throw new BadRequestException('Invalid content settings');
    const { settings: raw, revision } = body as { settings: unknown; revision: number };
    if (!Number.isSafeInteger(revision) || revision < 0) throw new BadRequestException('Invalid content revision');
    let settings: ContentConfig;
    try { settings = parseContentConfig(raw); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid content'); }
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Content database unavailable');
    try {
      await this.db.transaction(async manager => {
        await manager.query('INSERT IGNORE INTO store_content_settings (id, config, revision) VALUES (1, ?, 0)', [JSON.stringify(normalizeSections(defaultContentConfig()))]);
        const result = await manager.query('UPDATE store_content_settings SET config = ?, revision = revision + 1 WHERE id = 1 AND revision = ?', [JSON.stringify(settings), revision]);
        if (result.affectedRows !== 1) throw new ConflictException('El contenido cambió en otra pestaña. Recargá antes de guardar.');
      });
    } catch (error) { if (missingTable(error)) throw new ServiceUnavailableException('Aplicá la migración de contenido antes de guardar.'); throw error; }
    return { settings, revision: revision + 1, available: true };
  }
}
@Controller('admin/settings/content')
@UseGuards(OwnerGuard)
export class ContentSettingsController {
  constructor(@Inject(ContentSettings) private readonly content: ContentSettings) {}
  @Get() @Header('Cache-Control', 'private, no-store') get() { return this.content.get(); }
  @Put() @Header('Cache-Control', 'private, no-store') set(@Body() body: unknown) { return this.content.set(body); }
}
