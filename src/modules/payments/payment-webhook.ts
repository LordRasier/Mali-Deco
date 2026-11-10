import { Controller, HttpCode, Inject, Post, Query, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { header, type RequestLike } from '../identity/http/http';
import type { MercadoPagoTestProvider } from './mercadopago';
import { paymentCanAdvance } from '../orders/services/order-state';
import { recordOrderEvent } from '../orders/services/order-management';

export function verifyWebhook(secret: string, dataId: unknown, requestId: unknown, signature: unknown): string {
  if (typeof dataId !== 'string' || !/^[1-9]\d{0,15}$/.test(dataId) || typeof requestId !== 'string' || !/^[\w-]{1,200}$/.test(requestId) || typeof signature !== 'string' || signature.length > 256) throw new UnauthorizedException();
  const parts = signature.split(',').map(p => p.trim().split('='));
  const ts = parts.filter(p => p[0] === 'ts'), v1 = parts.filter(p => p[0] === 'v1');
  if (ts.length !== 1 || v1.length !== 1 || !/^\d{10,16}$/.test(ts[0][1] ?? '') || !/^[a-f\d]{64}$/i.test(v1[0][1] ?? '')) throw new UnauthorizedException();
  const expected = createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts[0][1]};`).digest();
  if (!timingSafeEqual(expected, Buffer.from(v1[0][1], 'hex'))) throw new UnauthorizedException();
  return dataId;
}
type Provider = Pick<MercadoPagoTestProvider, 'verifySeller' | 'notificationOrder' | 'reconcile' | 'sellerId'>;
export class PaymentWebhook {
  constructor(private readonly db?: DataSource, private readonly provider?: Provider, private readonly secret?: string) {}
  async receive(dataId: unknown, requestId: unknown, signature: unknown) {
    if (!this.provider || !this.secret || !this.db?.isInitialized) throw new ServiceUnavailableException('Payment notifications unavailable');
    const paymentId = verifyWebhook(this.secret, dataId, requestId, signature);
    try {
      await this.provider.verifySeller();
      const id = await this.provider.notificationOrder(paymentId);
      return await this.db.transaction(async tx => {
        const [order] = await tx.query(`SELECT id, currency, total_minor AS totalMinor, payment_status AS paymentStatus FROM checkout_orders WHERE id = ? FOR UPDATE`, [id]);
        if (!order) return { received: true };
        const [start] = await tx.query('SELECT seller_id AS sellerId FROM checkout_payment_starts WHERE order_id = ?', [id]);
        if (!start || String(start.sellerId) !== this.provider!.sellerId) return { received: true };
        // Serialize authoritative reads per order. A replay never reuses the notification's status.
        const next = await this.provider!.reconcile({ ...order, totalMinor: String(order.totalMinor) });
        if (next && paymentCanAdvance(order.paymentStatus, next)) {
          await tx.query('UPDATE checkout_orders SET payment_status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [next, id]);
          await recordOrderEvent(tx, id, 'mercadopago', 'Mercado Pago', { paymentId, changes: { paymentStatus: { from: order.paymentStatus, to: next } } });
        }
        return { received: true };
      });
    } catch { throw new ServiceUnavailableException('Payment verification unavailable'); }
  }
}
@Controller('payments/mercadopago')
export class PaymentWebhookController {
  constructor(@Inject(PaymentWebhook) private readonly webhook: PaymentWebhook) {}
  @Post('webhook') @HttpCode(200)
  receive(@Query() query: Record<string, unknown>, @Req() req: RequestLike) {
    return this.webhook.receive(query['data.id'], header(req, 'x-request-id'), header(req, 'x-signature'));
  }
}
