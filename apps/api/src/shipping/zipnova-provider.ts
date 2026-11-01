import { serializeZipnovaQuote, parseZipnovaQuote, validateDestination, validateZipnovaConfig } from './zipnova';
import type { Destination, DeliveryOption, ResolvedShipment, ZipnovaConfig } from './zipnova';

export type QuoteIntent = { lines: { productId: string; variantId: string; quantity: number }[]; destination: Destination };
export type UnavailableReason = 'DISABLED' | 'CONFIG_UNAVAILABLE' | 'CATALOG_UNAVAILABLE' | 'LOGISTICS_UNAVAILABLE' | 'INVALID_DESTINATION' | 'AUTH_ERROR' | 'RATE_LIMITED' | 'TIMEOUT' | 'DESTINATION_OR_LOGISTICS_INVALID' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE' | 'NO_OPTIONS';
export type ShippingOptionsResult = { status: 'quoted'; options: DeliveryOption[] } | { status: 'unavailable'; reason: UnavailableReason };
export type TrustedResolver = (intent: QuoteIntent) => Promise<{ status: 'resolved'; value: ResolvedShipment } | { status: 'unavailable'; reason: 'CATALOG_UNAVAILABLE' | 'LOGISTICS_UNAVAILABLE' }>;
export type ZipnovaTransport = (payload: ReturnType<typeof serializeZipnovaQuote>) => Promise<{ status: number; body: unknown }>;

export class DisabledOptionsProvider {
  async quote(): Promise<ShippingOptionsResult> { return { status: 'unavailable', reason: 'DISABLED' }; }
}

/** A transport is injected for tests; no network transport or public route is registered. */
export class ZipnovaQuoteAdapter {
  constructor(private readonly config: ZipnovaConfig, private readonly resolver: TrustedResolver, private readonly transport: ZipnovaTransport) {}

  async quote(intent: QuoteIntent): Promise<ShippingOptionsResult> {
    try { validateZipnovaConfig(this.config); } catch { return { status: 'unavailable', reason: 'CONFIG_UNAVAILABLE' }; }
    try { validateDestination(intent?.destination); } catch { return { status: 'unavailable', reason: 'INVALID_DESTINATION' }; }
    if (!Array.isArray(intent.lines) || !intent.lines.length || intent.lines.some(line => !line || typeof line.productId !== 'string' || !line.productId.trim() || typeof line.variantId !== 'string' || !line.variantId.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000)) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
    const snapshot: QuoteIntent = { destination: { ...intent.destination }, lines: intent.lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })) };
    let resolved: Awaited<ReturnType<TrustedResolver>>;
    try { resolved = await this.resolver(snapshot); } catch { return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' }; }
    if (resolved.status === 'unavailable') return resolved;
    let payload: ReturnType<typeof serializeZipnovaQuote>;
    try { payload = serializeZipnovaQuote({ ...resolved.value, destination: snapshot.destination }, this.config); }
    catch { return { status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' }; }
    let response: Awaited<ReturnType<ZipnovaTransport>>;
    try { response = await this.transport(payload); }
    catch (error) { return { status: 'unavailable', reason: error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'PROVIDER_ERROR' }; }
    if (!response || typeof response !== 'object') return { status: 'unavailable', reason: 'INVALID_RESPONSE' };
    if (response.status === 401 || response.status === 403) return { status: 'unavailable', reason: 'AUTH_ERROR' };
    if (response.status === 429) return { status: 'unavailable', reason: 'RATE_LIMITED' };
    if (response.status === 422) return { status: 'unavailable', reason: 'DESTINATION_OR_LOGISTICS_INVALID' };
    if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
    try {
      const options = parseZipnovaQuote(response.body, this.config);
      return options.length ? { status: 'quoted', options } : { status: 'unavailable', reason: 'NO_OPTIONS' };
    } catch { return { status: 'unavailable', reason: 'INVALID_RESPONSE' }; }
  }
}
