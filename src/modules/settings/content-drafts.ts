import { BadRequestException, Body, ConflictException, Controller, Get, Header, Inject, Post, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/http/owner.guard';
import { ContentSettings } from './content-settings';
import { defaultContentConfig, type ContentConfig } from './content-config';
import { normalizeSections, parseContentConfig, parseStoredContentConfig } from './content-validation';

export type ContentDraftSnapshot = {
  settings: ContentConfig; revision: number; publishedRevision: number;
  hasDraft: boolean; stale: boolean; available: boolean;
};
type Versions = { revision: number; publishedRevision: number };
const defaults = () => normalizeSections(defaultContentConfig());
const conflict = () => new ConflictException('El contenido cambió en otra pestaña. Se conserva tu borrador.');
export function parseDraftRequest(body: unknown, withSettings: boolean): Versions & { settings?: ContentConfig } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid draft');
  const input = body as Record<string, unknown>;
  const keys = withSettings ? ['settings', 'revision', 'publishedRevision'] : ['revision', 'publishedRevision'];
  if (Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k)) ||
      !Number.isSafeInteger(input.revision) || Number(input.revision) < 0 ||
      !Number.isSafeInteger(input.publishedRevision) || Number(input.publishedRevision) < 0) throw new BadRequestException('Invalid draft revision');
  try { return { revision: Number(input.revision), publishedRevision: Number(input.publishedRevision), ...(withSettings ? { settings: parseContentConfig(input.settings) } : {}) }; }
  catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid content'); }
}

/** Public readers only use ContentSettings. Drafts never enter public rendering or route gates. */
export class ContentDrafts {
  constructor(private readonly published: ContentSettings, private readonly db?: DataSource) {}
  async get(): Promise<ContentDraftSnapshot> {
    if (!this.db) return this.unavailable();
    if (!this.db.isInitialized) throw new ServiceUnavailableException('Content database unavailable');
    try {
      const [row] = await this.db.query(`SELECT p.config AS publishedConfig, p.revision AS publishedRevision,
        d.config AS draftConfig, d.revision AS revision, d.base_revision AS baseRevision, d.is_draft AS isDraft
        FROM (SELECT 1 AS id) seed LEFT JOIN store_content_settings p ON p.id = seed.id
        LEFT JOIN store_content_drafts d ON d.id = seed.id`);
      const hasDraft = !!Number(row?.isDraft), publishedRevision = Number(row?.publishedRevision ?? 0);
      return { settings: row?.publishedConfig || hasDraft ? parseStoredContentConfig(JSON.parse(hasDraft ? row.draftConfig : row.publishedConfig)) : defaults(),
        revision: Number(row?.revision ?? 0), publishedRevision, hasDraft,
        stale: hasDraft && Number(row.baseRevision) !== publishedRevision, available: true };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_NO_SUCH_TABLE') return this.unavailable();
      throw new ServiceUnavailableException('No se pudo cargar el borrador.');
    }
  }
  private async unavailable(): Promise<ContentDraftSnapshot> {
    const current = await this.published.get();
    return { settings: current.settings, revision: 0, publishedRevision: current.revision, available: false, hasDraft: false, stale: false };
  }
  async write(body: unknown, action: 'draft' | 'publish' | 'restore'): Promise<ContentDraftSnapshot> {
    const input = parseDraftRequest(body, action !== 'restore');
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Content database unavailable');
    try {
      return await this.db.transaction(async manager => {
        // Every editorial operation locks published first, then draft. Legacy publications also lock published.
        await manager.query('INSERT IGNORE INTO store_content_settings (id, config, revision) VALUES (1, ?, 0)', [JSON.stringify(defaults())]);
        const [published] = await manager.query('SELECT config, revision FROM store_content_settings WHERE id = 1 FOR UPDATE');
        await manager.query('INSERT IGNORE INTO store_content_drafts (id, config, revision, base_revision, is_draft) VALUES (1, ?, 0, ?, FALSE)', [published.config, published.revision]);
        const [draft] = await manager.query('SELECT config, revision, base_revision, is_draft FROM store_content_drafts WHERE id = 1 FOR UPDATE');
        if (Number(published.revision) !== input.publishedRevision || Number(draft.revision) !== input.revision ||
            action !== 'restore' && Number(draft.is_draft) && Number(draft.base_revision) !== input.publishedRevision) throw conflict();
        const settings = action === 'restore' ? parseStoredContentConfig(JSON.parse(published.config)) : input.settings!;
        const config = JSON.stringify(settings), publishedRevision = input.publishedRevision + (action === 'publish' ? 1 : 0);
        if (action === 'publish') await manager.query('UPDATE store_content_settings SET config = ?, revision = revision + 1 WHERE id = 1', [config]);
        await manager.query('UPDATE store_content_drafts SET config = ?, revision = revision + 1, base_revision = ?, is_draft = ? WHERE id = 1', [config, publishedRevision, action === 'draft']);
        return { settings, revision: input.revision + 1, publishedRevision, hasDraft: action === 'draft', stale: false, available: true };
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_NO_SUCH_TABLE') throw new ServiceUnavailableException('Aplicá la migración de contenido antes de guardar borradores.');
      throw error;
    }
  }
}

@Controller('admin/settings/content/editor')
@UseGuards(OwnerGuard)
export class ContentDraftsController {
  constructor(@Inject(ContentDrafts) private readonly drafts: ContentDrafts) {}
  @Get() @Header('Cache-Control', 'private, no-store') get() { return this.drafts.get(); }
  @Put('draft') @Header('Cache-Control', 'private, no-store') save(@Body() body: unknown) { return this.drafts.write(body, 'draft'); }
  @Post('publish') @Header('Cache-Control', 'private, no-store') publish(@Body() body: unknown) { return this.drafts.write(body, 'publish'); }
  @Post('restore') @Header('Cache-Control', 'private, no-store') restore(@Body() body: unknown) { return this.drafts.write(body, 'restore'); }
}
