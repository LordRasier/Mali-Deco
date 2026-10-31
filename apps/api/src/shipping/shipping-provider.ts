import { serializeAndreaniQuery, type AndreaniAccount } from './andreani-query';
import { parseAndreaniQuote } from './andreani-response';
import type { MoneyConfig, QuoteResult, ShippingProvider, ShippingRequest } from './shipping.types';

/** No network implementation exists yet; the transport must be supplied explicitly. */
export type QuoteTransport = (query: URLSearchParams) => Promise<{ status: number; body: unknown }>;

export class DisabledShippingProvider implements ShippingProvider {
  async quote(): Promise<QuoteResult> { return { status: 'unavailable', reason: 'disabled' }; }
}

export class AndreaniQuoteAdapter implements ShippingProvider {
  constructor(private readonly account: AndreaniAccount, private readonly money: MoneyConfig, private readonly transport: QuoteTransport) {}

  async quote(request: ShippingRequest): Promise<QuoteResult> {
    const query = serializeAndreaniQuery(request, this.account);
    let result: Awaited<ReturnType<QuoteTransport>>;
    try { result = await this.transport(query); } catch { return { status: 'unavailable', reason: 'provider_error' }; }
    if (!Number.isInteger(result.status) || result.status < 200 || result.status >= 300) return { status: 'unavailable', reason: 'provider_error' };
    try { return { status: 'quoted', ...parseAndreaniQuote(result.body, this.money) }; }
    catch { return { status: 'unavailable', reason: 'invalid_response' }; }
  }
}
