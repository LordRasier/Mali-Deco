import { isIP } from 'node:net';

export type PaymentOrder = { id: string; currency: string; totalMinor: string; paymentExpiresAt?: Date | string | null };
export type ReconciledPayment = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'partially_refunded' | 'in_mediation' | 'refunded' | 'charged_back';
export type VerifiedPayment = { status: ReconciledPayment; paymentId: string };
export type PaymentConfig = { token: string; sellerId: string; returnUrl: string; notificationUrl?: string; mode?: 'test' | 'production' };
export class PaymentProviderError extends Error {
  constructor(readonly code: 'http_error' | 'connection_failed' | 'invalid_response', readonly httpStatus?: number) {
    super('Payment provider unavailable');
  }
}
export class PaymentSellerError extends Error {
  constructor(readonly code: 'seller_id_mismatch' | 'seller_environment_mismatch' | 'seller_country_mismatch',
    readonly expectedSellerId: string, readonly actualSellerId: string) { super('Seller environment verification failed'); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identity = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : typeof v === 'string' && /^[1-9]\d{0,15}$/.test(v) ? v : '';

export function paymentConfig(env: NodeJS.ProcessEnv): PaymentConfig | null {
  if (env.NODE_ENV !== 'development' || env.LOCAL_TEST_CHECKOUT_ENABLED !== 'true' || env.MERCADOPAGO_TEST_ENABLED !== 'true') return null;
  const token = env.MERCADOPAGO_TEST_ACCESS_TOKEN, sellerId = env.MERCADOPAGO_TEST_SELLER_ID;
  if (!token || /\s/.test(token) || !sellerId || !identity(sellerId)) return null;
  try {
    const url = new URL(env.MERCADOPAGO_TEST_RETURN_URL!);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || isIP(url.hostname) || url.hostname.includes(':') || !url.hostname.includes('.') || /(?:^|\.)(localhost|local|internal)$/.test(url.hostname)) return null;
    let notificationUrl: string | undefined;
    if (env.MERCADOPAGO_WEBHOOK_URL) {
      const hook = new URL(env.MERCADOPAGO_WEBHOOK_URL);
      if (hook.protocol !== 'https:' || hook.username || hook.password || hook.port || hook.hash || hook.search || isIP(hook.hostname) || !hook.hostname.includes('.') || /(?:^|\.)(localhost|local|internal)$/.test(hook.hostname)) return null;
      notificationUrl = hook.href;
    }
    return { token, sellerId, returnUrl: url.href, ...(notificationUrl ? { notificationUrl } : {}) };
  } catch { return null; }
}

export function checkoutUrl(value: unknown, preferenceId: string): string {
  if (typeof value !== 'string') throw Error('Invalid payment redirect');
  const url = new URL(value);
  if (url.origin !== 'https://www.mercadopago.com.ar' || url.username || url.password || url.pathname !== '/checkout/v1/redirect' || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.get('pref_id') !== preferenceId) throw Error('Invalid payment redirect');
  return url.href;
}

/** Each instance belongs to one seller and environment. No retry of an uncertain POST. */
export class MercadoPagoTestProvider {
  private verified = false;
  private verification: Promise<void> | undefined;
  constructor(private readonly config: PaymentConfig, private readonly request: typeof fetch = fetch) {}
  get sellerId(): string { return this.config.sellerId; }
  private async json(url: string, body?: object): Promise<unknown> {
    let response: Response;
    try { response = await this.request(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new PaymentProviderError('connection_failed'); }
    if (!response.ok) throw new PaymentProviderError('http_error', response.status);
    try { return await response.json(); }
    catch { throw new PaymentProviderError('invalid_response'); }
  }
  verifySeller(): Promise<void> {
    if (!this.verification) this.verification = this.checkSeller().catch(error => { this.verification = undefined; throw error; });
    return this.verification;
  }
  /** Explicit diagnostics always perform a fresh authenticated read. */
  verifyConnection(): Promise<void> { return this.checkSeller(); }
  private async checkSeller(): Promise<void> {
    // Use the Mercado Pago User API, as in its official SDK; never infer test mode from token prefixes.
    const seller = await this.json('https://api.mercadopago.com/users/me');
    if (!record(seller) || !identity(seller.id) || !Array.isArray(seller.tags)) throw Error('Seller environment verification failed');
    const actualSellerId = identity(seller.id);
    if (actualSellerId !== this.config.sellerId) throw new PaymentSellerError('seller_id_mismatch', this.config.sellerId, actualSellerId);
    if (seller.site_id !== 'MLA') throw new PaymentSellerError('seller_country_mismatch', this.config.sellerId, actualSellerId);
    if (seller.tags.includes('test_user') !== (this.config.mode !== 'production')) throw new PaymentSellerError('seller_environment_mismatch', this.config.sellerId, actualSellerId);
    this.verified = true;
  }
  private amount(order: PaymentOrder): number {
    // Bounded to retain exact cents when serialized to the provider's decimal number.
    if (!this.verified || order.currency !== 'ARS' || !/^[1-9]\d{0,8}$/.test(order.totalMinor)) throw Error('Invalid payment amount');
    return Number(order.totalMinor) / 100;
  }
  async start(order: PaymentOrder): Promise<{ preferenceId: string; url: string }> {
    const amount = this.amount(order);
    const expiresAt = order.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : undefined;
    if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) throw Error('Expired payment reservation');
    const value = await this.json('https://api.mercadopago.com/checkout/preferences', {
      items: [{ id: order.id, title: this.config.mode === 'production' ? 'Pedido de la tienda' : 'Pedido de prueba', quantity: 1, currency_id: 'ARS', unit_price: amount }],
      external_reference: order.id,
      auto_return: 'approved',
      ...(expiresAt === undefined ? {} : { expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: new Date(expiresAt).toISOString() }),
      ...(this.config.notificationUrl ? { notification_url: this.config.notificationUrl } : {}),
      back_urls: { success: this.config.returnUrl, pending: this.config.returnUrl, failure: this.config.returnUrl },
    });
    if (!record(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(value.id) || identity(value.collector_id) !== this.config.sellerId || value.external_reference !== order.id) throw Error('Invalid preference response');
    return { preferenceId: value.id, url: checkoutUrl(value.init_point, value.id) };
  }
  async preferenceExpired(preferenceId: string, order: PaymentOrder, deadline: number): Promise<boolean> {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(preferenceId) || !Number.isFinite(deadline)) throw Error('Invalid preference');
    const value = await this.json(`https://api.mercadopago.com/checkout/preferences/${preferenceId}`);
    if (!record(value) || value.id !== preferenceId || identity(value.collector_id) !== this.sellerId || value.external_reference !== order.id) throw Error('Untrusted preference');
    const end = typeof value.expiration_date_to === 'string' ? Date.parse(value.expiration_date_to) : NaN;
    return value.preference_expired === true && Number.isFinite(end) && end <= deadline && end <= Date.now();
  }
  async notificationOrder(paymentId: string): Promise<string> {
    if (!this.verified || !identity(paymentId)) throw Error('Invalid payment notification');
    const value = await this.json(`https://api.mercadopago.com/v1/payments/${paymentId}`);
    // Checkout Pro test sellers can return live_mode=true. The test boundary is
    // the authenticated test_user identity and matching collector, not this flag.
    if (!record(value) || identity(value.id) !== paymentId || typeof value.live_mode !== 'boolean' || (this.config.mode === 'production' && !value.live_mode) || identity(value.collector_id) !== this.sellerId || typeof value.external_reference !== 'string' || !/^[a-f0-9-]{36}$/.test(value.external_reference)) throw Error('Untrusted payment notification');
    return value.external_reference;
  }
  async reconcile(order: PaymentOrder): Promise<ReconciledPayment | null> {
    return (await this.reconcileDetails(order))?.status ?? null;
  }
  async reconcileDetails(order: PaymentOrder): Promise<VerifiedPayment | null> {
    this.amount(order);
    const value = await this.json(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${encodeURIComponent(order.id)}&limit=100`);
    if (!record(value) || !Array.isArray(value.results) || !record(value.paging) || value.paging.total !== value.results.length || value.results.length > 100) throw Error('Incomplete payment search');
    const payments: VerifiedPayment[] = [];
    for (const payment of value.results) {
      if (!record(payment) || !identity(payment.id) || typeof payment.live_mode !== 'boolean' || (this.config.mode === 'production' && !payment.live_mode) || identity(payment.collector_id) !== this.config.sellerId || payment.external_reference !== order.id || payment.currency_id !== order.currency) throw Error('Untrusted payment');
      const decimal = String(payment.transaction_amount);
      if (!/^\d+(\.\d{1,2})?$/.test(decimal)) throw Error('Invalid payment amount');
      const [whole, fraction = ''] = decimal.split('.');
      if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) !== BigInt(order.totalMinor)) throw Error('Payment amount mismatch');
      const status = payment.status;
      let normalized: ReconciledPayment;
      if (status === 'pending' || status === 'in_process' || status === 'authorized') normalized = 'pending';
      else if (status === 'approved' && payment.status_detail === 'partially_refunded') normalized = 'partially_refunded';
      else if (status === 'approved' || status === 'rejected' || status === 'cancelled' || status === 'in_mediation' || status === 'refunded' || status === 'charged_back') normalized = status;
      else throw Error('Unknown payment status');
      payments.push({ status: normalized, paymentId: identity(payment.id) });
    }
    // Conflicting monetary outcomes need operator investigation, not an arbitrary winner.
    const monetary = ['approved', 'partially_refunded', 'in_mediation', 'refunded', 'charged_back'];
    if (payments.filter(payment => monetary.includes(payment.status)).length > 1) throw Error('Multiple monetary outcomes');
    return payments.find(payment => monetary.includes(payment.status)) ?? payments.find(payment => payment.status === 'pending') ?? payments[0] ?? null;
  }
}
