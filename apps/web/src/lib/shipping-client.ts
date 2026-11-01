export type QuoteLine = { productId: string; variantId: string; quantity: number };
export type ShippingDestination = { country: 'AR'; city: string; state: string; postalCode: string };
export type ShippingOption = { carrierId: number; carrierName: string; serviceCode: string; serviceName: string; logisticType: string; amountMinor: string; currency: string; pickupPoints?: { id: number; description: string }[] };
export type ShippingResult = { status: 'quoted'; options: ShippingOption[]; packageCount: number } | { status: 'unavailable'; reason: string };

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
  if (response.status !== 'quoted' || !Array.isArray(response.options) || !response.options.length || response.options.length > 100 || typeof response.packageCount !== 'number' || !Number.isSafeInteger(response.packageCount) || response.packageCount < 1 || response.packageCount > 1000) throw new Error('Respuesta inválida');
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
  return { status: 'quoted', options, packageCount: response.packageCount };
}
