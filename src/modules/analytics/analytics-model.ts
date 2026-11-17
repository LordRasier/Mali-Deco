export type AnalyticsConfig = { enabled: boolean; measurementId: string; apiSecret: string };
export function analyticsConfig(env: NodeJS.ProcessEnv = process.env): AnalyticsConfig {
  const measurementId = env.GA4_MEASUREMENT_ID || '', apiSecret = env.GA4_API_SECRET || '';
  return { enabled: env.NODE_ENV === 'production' && env.GA4_SERVER_ENABLED === 'true' && /^G-[A-Z0-9]{6,20}$/.test(measurementId) && /^[\w-]{10,200}$/.test(apiSecret), measurementId, apiSecret };
}
export type AnalyticsIdentity = { measurementId: string; clientId: string; sessionId: string };
export function parseAnalyticsIdentity(value: unknown, measurementId: string, now = Date.now()): AnalyticsIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.consent !== true || v.measurementId !== measurementId || typeof v.clientId !== 'string' || !/^\d{1,20}\.\d{1,20}$/.test(v.clientId) || typeof v.sessionId !== 'string' || !/^\d{1,16}$/.test(v.sessionId)) return null;
  const started = Number(v.sessionId) * 1000;
  if (!Number.isSafeInteger(started) || started > now + 60000 || started < now - 86400000) return null;
  return { measurementId, clientId: v.clientId, sessionId: v.sessionId };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);
const amount = (v: unknown): bigint => {
  if ((typeof v !== 'string' && typeof v !== 'number') || !/^(0|[1-9]\d*)$/.test(String(v)) || BigInt(v) > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Invalid analytics amount');
  return BigInt(v);
};
/** Only the immutable, server-priced snapshot supplies items and revenue. ARS is the payment currency. */
export function orderCommerce(snapshot: unknown, orderId: string) {
  const saved: unknown = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  if (!record(saved) || !record(saved.result) || !record(saved.quote)) throw Error('Invalid analytics order');
  const o = saved.result, quote = saved.quote;
  if (!identifier(orderId) || o.id !== orderId || o.testLocal !== false || o.paymentMode !== 'production' || o.currency !== 'ARS' || !record(o.shipping) || !Array.isArray(quote.lines) || !quote.lines.length || quote.lines.length > 100) throw Error('Ineligible analytics order');
  let total = 0n;
  const seen = new Set<string>();
  const items = quote.lines.map((line: unknown) => {
    if (!record(line) || !identifier(line.productId) || !identifier(line.variantId) || line.currency !== 'ARS' || !Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 999) throw Error('Invalid analytics item');
    const pair = `${line.productId}:${line.variantId}`;
    if (seen.has(pair)) throw Error('Duplicate analytics item'); seen.add(pair);
    const price = amount(line.priceMinor); total += price * BigInt(Number(line.quantity));
    // IDs, rather than buyer-supplied personalization or free text, identify the purchased product and variant.
    const name = typeof line.name === 'string' && !/[\p{Cc}<>@]/u.test(line.name) ? line.name.slice(0, 100) : line.productId;
    return { item_id: line.productId, item_name: name, item_variant: line.variantId, price: Number(price) / 100, quantity: Number(line.quantity) };
  });
  const shipping = amount(o.shipping.amountMinor);
  if (total + shipping !== amount(o.totalMinor) || total > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Analytics order totals disagree');
  return { transaction_id: orderId, currency: 'ARS', value: Number(total) / 100, shipping: Number(shipping) / 100, items };
}
export function measurementBody(identity: AnalyticsIdentity, name: 'purchase' | 'refund', commerce: ReturnType<typeof orderCommerce>, occurredAt: Date, now = Date.now()) {
  const occurred = occurredAt.getTime();
  if (!Number.isFinite(occurred) || occurred > now + 60000 || occurred < now - 72 * 3600000) throw Error('Analytics event expired');
  const sessionStart = Number(identity.sessionId) * 1000;
  return { client_id: identity.clientId, timestamp_micros: occurred * 1000,
    consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
    events: [{ name, params: { ...commerce,
      // Never attribute a delayed settlement/refund to an expired online session.
      ...(now - sessionStart <= 86400000 && occurred >= sessionStart ? { session_id: Number(identity.sessionId) } : {}) } }] };
}
