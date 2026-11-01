import { BadRequestException, Body, Controller, Get, Inject, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/owner.guard';

export function parseStoreName(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) throw new BadRequestException('Invalid settings');
  const name = (body as { name: unknown }).name;
  if (typeof name !== 'string') throw new BadRequestException('Invalid store name');
  const normalized = name.trim();
  if (!normalized || Array.from(normalized).length > 255 || /[\p{Cc}\uD800-\uDFFF]/u.test(name)) throw new BadRequestException('Invalid store name');
  return normalized;
}

export class StoreSettings {
  constructor(private readonly db?: DataSource) {}
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Settings database unavailable');
    return this.db;
  }
  async get(): Promise<{ name: string | null }> {
    const rows: Array<{ name: string }> = await this.database().query('SELECT store_name AS name FROM store_settings WHERE id = 1');
    return { name: rows[0]?.name ?? null };
  }
  async set(body: unknown): Promise<{ name: string }> {
    const name = parseStoreName(body);
    await this.database().query('INSERT INTO store_settings (id, store_name) VALUES (1, ?) ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)', [name]);
    return { name };
  }
}

@Controller('admin/settings')
@UseGuards(OwnerGuard)
export class StoreSettingsController {
  constructor(@Inject(StoreSettings) private readonly settings: StoreSettings) {}
  @Get() get() { return this.settings.get(); }
  @Put() set(@Body() body: unknown) { return this.settings.set(body); }
}
