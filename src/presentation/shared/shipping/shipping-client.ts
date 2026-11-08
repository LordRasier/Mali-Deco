export type QuoteLine = { productId: string; variantId: string; quantity: number };
export type ShippingDestination = { country: 'AR'; city: string; state: string; postalCode: string };
export type ShippingOption = { carrierId: number; carrierName: string; serviceCode: string; serviceName: string; logisticType: string; amountMinor: string; currency: string; pickupPoints?: { id: number; description: string }[] };
export type ShippingResult = { status: 'quoted'; options: ShippingOption[]; packageCount: number; quotedAt: number; validUntil: number } | { status: 'unavailable'; reason: string };
export type SelectedShipping = { amountMinor: string; currency: string; validUntil: number };

export function invalidPostalCode(value: string): boolean {
  const code = value.trim();
  return !!code && (!/^\d+$/.test(code) || code.length > 4);
}

/** Estimate the least expensive eligible service; pickup still needs an explicit point. */
export function cheapestShipping(quote: ShippingResult | null, totals: Record<string, bigint>): { choiceKey: string | null; requiresPickup: boolean; shipping: SelectedShipping } | null {
  const currencies = Object.keys(totals);
  if (!quote || quote.status !== 'quoted' || quote.validUntil <= Date.now() || currencies.length !== 1) return null;
  let best = -1;
  quote.options.forEach((option,index) => {
    if (option.currency !== currencies[0]) return;
    if (best < 0 || BigInt(option.amountMinor) < BigInt(quote.options[best].amountMinor)) best = index;
  });
  if (best < 0) return null;
  const option = quote.options[best], requiresPickup = option.serviceCode === 'pickup_point';
  return {choiceKey:requiresPickup ? null : String(best),requiresPickup,shipping:{amountMinor:option.amountMinor,currency:option.currency,validUntil:quote.validUntil}};
}

export function shippingDestinationErrors(destination: ShippingDestination): { state: boolean; city: boolean; postalCode: boolean } {
  return { state: !destination.state.trim(), city: !destination.city.trim(), postalCode: !destination.postalCode.trim() };
}

/** Never combine amounts in different currencies or treat a missing quote as free. */
export function selectedShippingTotal(totals: Record<string, bigint>, shipping: SelectedShipping | null): { currency: string; amountMinor: bigint } | null {
  const entries = Object.entries(totals);
  if (!shipping || !Number.isSafeInteger(shipping.validUntil) || shipping.validUntil <= Date.now() || entries.length !== 1 || entries[0][0] !== shipping.currency || !/^(0|[1-9]\d*)$/.test(shipping.amountMinor)) return null;
  return { currency: shipping.currency, amountMinor: entries[0][1] + BigInt(shipping.amountMinor) };
}

export function shippingKey(lines: QuoteLine[], destination: ShippingDestination): string {
  return JSON.stringify([lines.map(line => [line.productId, line.variantId, line.quantity]), destination.country, destination.city, destination.state, destination.postalCode]);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta inválida');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 150) throw new Error('Respuesta inválida');
  return value;
}
function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Respuesta inválida');
  return value;
}
export function parseShippingResult(value: unknown): ShippingResult {
  const response = object(value);
  if (response.status === 'unavailable') return { status: 'unavailable', reason: text(response.reason) };
  const now = Date.now();
  if (response.status !== 'quoted' || !Array.isArray(response.options) || !response.options.length || response.options.length > 100 || typeof response.packageCount !== 'number' || !Number.isSafeInteger(response.packageCount) || response.packageCount < 1 || response.packageCount > 1000 || typeof response.quotedAt !== 'number' || !Number.isSafeInteger(response.quotedAt) || typeof response.validUntil !== 'number' || !Number.isSafeInteger(response.validUntil) || response.validUntil <= now || response.validUntil > now + 300000 || response.validUntil <= response.quotedAt || response.validUntil - response.quotedAt > 300000) throw new Error('Respuesta inválida');
  const options = response.options.map(raw => {
    const option = object(raw), serviceCode = text(option.serviceCode), currency = text(option.currency), amountMinor = text(option.amountMinor);
    if (!/^[A-Z]{3}$/.test(currency) || !/^(0|[1-9]\d{0,15})$/.test(amountMinor) || BigInt(amountMinor) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Respuesta inválida');
    let pickupPoints: ShippingOption['pickupPoints'];
    if (serviceCode === 'pickup_point') {
      if (!Array.isArray(option.pickupPoints) || !option.pickupPoints.length || option.pickupPoints.length > 5) throw new Error('Respuesta inválida');
      pickupPoints = option.pickupPoints.map(rawPoint => { const point = object(rawPoint); return { id: id(point.id), description: text(point.description) }; });
    }
    return { carrierId: id(option.carrierId), carrierName: text(option.carrierName), serviceCode, serviceName: text(option.serviceName), logisticType: text(option.logisticType), amountMinor, currency, ...(pickupPoints ? { pickupPoints } : {}) };
  });
  return { status: 'quoted', options, packageCount: response.packageCount, quotedAt: response.quotedAt, validUntil: response.validUntil };
}
