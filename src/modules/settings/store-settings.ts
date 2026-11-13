import { BadRequestException, Body, Controller, Get, Inject, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DEFAULT_PRIMARY_COLOR, parsePrimaryColor } from './store-theme';
import { OwnerGuard } from '../identity/http/owner.guard';
import { normalizeInstagramUsername, normalizeWhatsAppNumber } from '../../shared/social-links';
import { isHeaderBrandMode, type HeaderBrandSettings } from '../../shared/header-brand';

export type SocialSettings = { whatsappNumber?: string | null; instagramUsername?: string | null };
type Settings = { name: string | null; primaryColor: string } & SocialSettings & HeaderBrandSettings;
const missingColumn = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ER_BAD_FIELD_ERROR';

export function parseStoreName(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['name', 'primaryColor', 'whatsappNumber', 'instagramUsername', 'headerBrandMode'].includes(key)) || !Object.hasOwn(body, 'name')) throw new BadRequestException('Invalid settings');
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
  async get(): Promise<Settings> {
    let rows: Array<Partial<Settings>>;
    let socialColumnsAvailable = true, headerColumnAvailable = true;
    try { rows = await this.database().query('SELECT store_name AS name, primary_color AS primaryColor, whatsapp_number AS whatsappNumber, instagram_username AS instagramUsername, header_brand_mode AS headerBrandMode FROM store_settings WHERE id = 1'); }
    catch (error) {
      if (!missingColumn(error)) throw error;
      headerColumnAvailable = false;
      try { rows = await this.database().query('SELECT store_name AS name, primary_color AS primaryColor, whatsapp_number AS whatsappNumber, instagram_username AS instagramUsername FROM store_settings WHERE id = 1'); }
      catch (socialError) {
        if (!missingColumn(socialError)) throw socialError;
        socialColumnsAvailable = false;
        try { rows = await this.database().query('SELECT store_name AS name, primary_color AS primaryColor FROM store_settings WHERE id = 1'); }
        catch (legacyError) {
          if (!missingColumn(legacyError)) throw legacyError;
          rows = await this.database().query('SELECT store_name AS name FROM store_settings WHERE id = 1');
        }
      }
    }
    const row = rows[0];
    return { name: row?.name ?? null, primaryColor: row?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      ...(headerColumnAvailable ? { headerBrandMode: isHeaderBrandMode(row?.headerBrandMode) ? row.headerBrandMode : 'logo_text' as const } : {}),
      ...(socialColumnsAvailable ? { whatsappNumber: row?.whatsappNumber ?? null, instagramUsername: row?.instagramUsername ?? null } : {}) };
  }
  async set(body: unknown): Promise<{ name: string; primaryColor?: string } & SocialSettings & HeaderBrandSettings> {
    const name = parseStoreName(body);
    const input = body as Record<string, unknown>;
    const result: { name: string; primaryColor?: string } & SocialSettings & HeaderBrandSettings = { name };
    const fields: Array<{ column: string; value: string }> = [{ column: 'store_name', value: name }];
    if (Object.hasOwn(input, 'headerBrandMode')) {
      if (!isHeaderBrandMode(input.headerBrandMode)) throw new BadRequestException('Elegí cómo mostrar la marca en el encabezado.');
      result.headerBrandMode = input.headerBrandMode;
      fields.push({ column: 'header_brand_mode', value: result.headerBrandMode });
    }
    if (Object.hasOwn(input, 'primaryColor')) {
      result.primaryColor = parsePrimaryColor(input.primaryColor);
      fields.push({ column: 'primary_color', value: result.primaryColor });
    }
    for (const [key, column, normalize] of [
      ['whatsappNumber', 'whatsapp_number', normalizeWhatsAppNumber],
      ['instagramUsername', 'instagram_username', normalizeInstagramUsername],
    ] as const) {
      if (!Object.hasOwn(input, key)) continue;
      const value = normalize(input[key]);
      if (value === null) throw new BadRequestException(key === 'whatsappNumber' ? 'Ingresá un número de WhatsApp internacional válido.' : 'Ingresá un usuario o enlace de Instagram válido.');
      result[key] = value; fields.push({ column, value });
    }
    try {
      await this.database().query(`INSERT INTO store_settings (id, ${fields.map(field => field.column).join(', ')}) VALUES (1, ${fields.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${fields.map(field => `${field.column} = VALUES(${field.column})`).join(', ')}`, fields.map(field => field.value));
    } catch (error) {
      if (missingColumn(error)) throw new ServiceUnavailableException('Se requiere actualizar la base de datos de configuración antes de guardar.');
      throw error;
    }
    return result;
  }
}

@Controller('admin/settings')
@UseGuards(OwnerGuard)
export class StoreSettingsController {
  constructor(@Inject(StoreSettings) private readonly settings: StoreSettings) {}
  @Get() get() { return this.settings.get(); }
  @Put() set(@Body() body: unknown) { return this.settings.set(body); }
}
