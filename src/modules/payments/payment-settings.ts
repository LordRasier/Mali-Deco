import { BadRequestException, Body, ConflictException, Controller, Get, Header, HttpCode, Inject, Post, Put, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { OwnerGuard } from '../identity/http/owner.guard';
import { sessionToken, type RequestLike } from '../identity/http/http';
import { IdentityService } from '../identity/services/identity-service';
import { isPaymentMode, PaymentRegistry, type PaymentMode } from './payment-registry';

export type PaymentSettingsSnapshot = { enabled: boolean; mode: PaymentMode; revision: number; available: boolean };
export class PaymentSettings {
  constructor(private readonly db: DataSource | undefined, private readonly registry: PaymentRegistry) {}
  async get(): Promise<PaymentSettingsSnapshot> {
    const unavailable: PaymentSettingsSnapshot = { enabled: false, mode: 'test', revision: 0, available: false };
    if (!this.db?.isInitialized) return unavailable;
    try {
      const [row] = await this.db.query('SELECT enabled, mode, revision FROM store_payment_settings WHERE id = 1');
      if (!row || !isPaymentMode(row.mode)) return unavailable;
      return { enabled: !!Number(row.enabled), mode: row.mode, revision: Number(row.revision), available: true };
    } catch (e) { if ((e as { code?: string }).code === 'ER_NO_SUCH_TABLE') return unavailable; throw e; }
  }
  async view() { return { ...await this.get(), credentials: [this.registry.describe('production'), this.registry.describe('test')] }; }
  async set(body: unknown, actor: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'enabled,mode,revision') throw new BadRequestException('Configuración de pagos inválida.');
    const { enabled, mode, revision } = body as PaymentSettingsSnapshot;
    if (typeof enabled !== 'boolean' || !isPaymentMode(mode) || !Number.isSafeInteger(revision) || revision < 0) throw new BadRequestException('Configuración de pagos inválida.');
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Configuración no disponible.');
    if (enabled) await this.registry.verify(mode);
    await this.db.transaction(async tx => {
      const [previous] = await tx.query('SELECT enabled, mode, revision FROM store_payment_settings WHERE id = 1 FOR UPDATE');
      if (!previous) throw new ServiceUnavailableException('Aplicá la migración de pagos antes de guardar.');
      if (Number(previous.revision) !== revision) throw new ConflictException('La configuración cambió. Recargala antes de guardar.');
      await tx.query('UPDATE store_payment_settings SET enabled = ?, mode = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = 1', [enabled ? 1 : 0, mode]);
      await tx.query('INSERT INTO payment_settings_events (id, actor, detail) VALUES (?, ?, ?)', [randomUUID(), actor, JSON.stringify({ previous: { enabled: !!Number(previous.enabled), mode: previous.mode, revision }, next: { enabled, mode, revision: revision + 1 } })]);
    });
    return this.view();
  }
}

@Controller('admin/settings/payments')
@UseGuards(OwnerGuard)
export class PaymentSettingsController {
  constructor(@Inject(PaymentSettings) private readonly settings: PaymentSettings, @Inject(PaymentRegistry) private readonly registry: PaymentRegistry, @Inject(IdentityService) private readonly identity: IdentityService) {}
  @Get() @Header('Cache-Control', 'private, no-store') get() { return this.settings.view(); }
  @Put() @Header('Cache-Control', 'private, no-store') async set(@Body() body: unknown, @Req() req: RequestLike) {
    const actor = await this.identity.authorize(sessionToken(req), ['owner']);
    return this.settings.set(body, actor.userId);
  }
  @Post('verify') @HttpCode(200) @Header('Cache-Control', 'private, no-store') verify(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'mode' || !('mode' in body) || !isPaymentMode(body.mode)) throw new BadRequestException();
    return this.registry.verify(body.mode);
  }
}
