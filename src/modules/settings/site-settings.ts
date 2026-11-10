import { BadRequestException, Body, ConflictException, Controller, Get, Header, Inject, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/http/owner.guard';
import { defaultSiteConfig, parseSiteConfig, type SiteConfig } from './site-config';

export type SiteSettingsSnapshot = { settings: SiteConfig; revision: number; available: boolean };
const missingTable = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && e.code === 'ER_NO_SUCH_TABLE';

export class SiteSettings {
  constructor(private readonly db?: DataSource) {}
  async get(): Promise<SiteSettingsSnapshot> {
    if (!this.db?.isInitialized) return { settings: defaultSiteConfig(), revision: 0, available: false };
    try {
      const rows: { config: string; revision: number }[] = await this.db.query('SELECT config, revision FROM store_site_settings WHERE id = 1');
      const row = rows[0];
      return { settings: row ? parseSiteConfig(JSON.parse(row.config)) : defaultSiteConfig(), revision: Number(row?.revision ?? 0), available: true };
    } catch (error) {
      if (missingTable(error)) return { settings: defaultSiteConfig(), revision: 0, available: false };
      throw error;
    }
  }
  async publicSettings(): Promise<SiteConfig> {
    try { return (await this.get()).settings; } catch { return defaultSiteConfig(); }
  }
  async set(body: unknown): Promise<SiteSettingsSnapshot> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['settings', 'revision'].includes(k))) throw new BadRequestException('Invalid site settings');
    const { settings: raw, revision } = body as { settings: unknown; revision: number };
    if (!Number.isSafeInteger(revision) || revision < 0) throw new BadRequestException('Invalid settings revision');
    let settings: SiteConfig;
    try { settings = parseSiteConfig(raw); } catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'Invalid site settings'); }
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Settings database unavailable');
    try {
      await this.db.transaction(async manager => {
        await manager.query('INSERT IGNORE INTO store_site_settings (id, config, revision) VALUES (1, ?, 0)', [JSON.stringify(defaultSiteConfig())]);
        const result = await manager.query('UPDATE store_site_settings SET config = ?, revision = revision + 1 WHERE id = 1 AND revision = ?', [JSON.stringify(settings), revision]);
        if (result.affectedRows !== 1) throw new ConflictException('La configuración cambió. Recargala antes de guardar.');
      });
    } catch (e) { if (missingTable(e)) throw new ServiceUnavailableException('Aplicá la actualización SEO de la base antes de guardar.'); throw e; }
    return { settings, revision: revision + 1, available: true };
  }
}

@Controller('admin/settings/seo')
@UseGuards(OwnerGuard)
export class SiteSettingsController {
  constructor(@Inject(SiteSettings) private readonly settings: SiteSettings) {}
  @Get() @Header('Cache-Control', 'private, no-store') get() { return this.settings.get(); }
  @Put() @Header('Cache-Control', 'private, no-store') set(@Body() body: unknown) { return this.settings.set(body); }
}
