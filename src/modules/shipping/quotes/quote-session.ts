import { createHash } from 'node:crypto';
import type { QuoteIntent, ShippingOptionsResult } from '../providers/zipnova/zipnova-provider';

/** A fingerprint identifies the complete request; it never establishes catalog authority. */
export function quoteFingerprint(intent: QuoteIntent): string {
  const lines = intent.lines.map(line => [line.productId, line.variantId, line.quantity] as const)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const { country, postalCode, city, state } = intent.destination;
  return createHash('sha256').update(JSON.stringify({ lines, destination: [country, postalCode, city, state] })).digest('hex');
}

/** Call update on every cart/destination change; stale and superseded responses are discarded. */
export class QuoteSession {
  private revision = 0;
  private fingerprint: string | undefined;
  private current: ShippingOptionsResult | undefined;

  update(intent: QuoteIntent): void {
    const fingerprint = quoteFingerprint(intent);
    if (fingerprint !== this.fingerprint) { this.revision++; this.current = undefined; this.fingerprint = fingerprint; }
  }

  get result(): ShippingOptionsResult | undefined { return this.current; }

  async request(intent: QuoteIntent, quote: (input: QuoteIntent) => Promise<ShippingOptionsResult>): Promise<void> {
    this.update(intent);
    const revision = ++this.revision;
    this.current = undefined;
    const snapshot = { destination: { ...intent.destination }, lines: intent.lines.map(line => ({ ...line })) };
    const result = await quote(snapshot);
    if (revision === this.revision) this.current = result;
  }
}
