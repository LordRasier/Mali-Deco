import { ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import { MercadoPagoTestProvider, type PaymentConfig } from './mercadopago';

export type PaymentMode = 'test' | 'production';
export type PaymentContext = { mode: PaymentMode; sellerId: string; revision: number };
export const isPaymentMode = (value: unknown): value is PaymentMode => value === 'test' || value === 'production';

/** The deployment environment and the payment environment are independent. */
export function publicPaymentOrigin(env: NodeJS.ProcessEnv): string | undefined {
  try {
    const url = new URL(env.PUBLIC_SITE_URL!);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || isIP(url.hostname) || url.hostname.includes(':') || !url.hostname.includes('.') || /(?:^|\.)(localhost|local|internal)$/.test(url.hostname)) return;
    return url.origin;
  } catch { return; }
}

export class PaymentRegistry {
  private readonly providers = new Map<PaymentMode, MercadoPagoTestProvider>();
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly fetcher: typeof fetch = fetch) {}
  describe(mode: PaymentMode) {
    const prefix = mode === 'test' ? 'MERCADOPAGO_TEST_' : 'MERCADOPAGO_';
    const sellerId = this.env[prefix + 'SELLER_ID'];
    const missing = ['SELLER_ID', 'ACCESS_TOKEN', 'WEBHOOK_SECRET'].filter(key => !this.env[prefix + key]?.trim()).map(key => prefix + key);
    if (!publicPaymentOrigin(this.env)) missing.push('PUBLIC_SITE_URL (HTTPS)');
    if (mode === 'production' && this.env.NODE_ENV !== 'production') missing.push('NODE_ENV=production');
    const valid = /^[1-9]\d{0,15}$/.test(sellerId ?? '') && /^[\x21-\x7e]{1,4096}$/.test(this.env[prefix + 'ACCESS_TOKEN'] ?? '') && /^[\x21-\x7e]{16,512}$/.test(this.env[prefix + 'WEBHOOK_SECRET'] ?? '');
    return { mode, sellerId: /^[1-9]\d{0,15}$/.test(sellerId ?? '') ? sellerId : null, configured: !missing.length && valid, missing,
      webhookUrl: publicPaymentOrigin(this.env) ? `${publicPaymentOrigin(this.env)}/api/v1/payments/mercadopago/webhook/${mode}` : null };
  }
  get(mode: PaymentMode, sellerId?: string): MercadoPagoTestProvider {
    const description = this.describe(mode);
    if (!description.configured || (sellerId !== undefined && sellerId !== description.sellerId)) throw new ServiceUnavailableException('Credenciales de pago no disponibles para este vendedor y entorno.');
    let provider = this.providers.get(mode);
    if (!provider) {
      const prefix = mode === 'test' ? 'MERCADOPAGO_TEST_' : 'MERCADOPAGO_';
      const config: PaymentConfig = { mode, token: this.env[prefix + 'ACCESS_TOKEN']!, sellerId: description.sellerId!, returnUrl: `${publicPaymentOrigin(this.env)}/checkout/return`, notificationUrl: description.webhookUrl! };
      provider = new MercadoPagoTestProvider(config, this.fetcher); this.providers.set(mode, provider);
    }
    return provider;
  }
  secret(mode: PaymentMode): string {
    this.get(mode);
    return this.env[mode === 'test' ? 'MERCADOPAGO_TEST_WEBHOOK_SECRET' : 'MERCADOPAGO_WEBHOOK_SECRET']!;
  }
  async verify(mode: PaymentMode) {
    try { await this.get(mode).verifyConnection(); }
    catch { throw new ServiceUnavailableException('No se pudo verificar el vendedor de Mercado Pago. Revisá las credenciales del entorno seleccionado.'); }
    return { ...this.describe(mode), verified: true };
  }
}
