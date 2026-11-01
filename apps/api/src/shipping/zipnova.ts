import type { MoneyConfig } from './shipping.types';

export type ZipnovaConfig = MoneyConfig & { accountId: number; originId: number; source: string };
export type Destination = { country: 'AR'; postalCode: string; city: string; state: string };
export type PackedParcel = { widthMm: number; heightMm: number; lengthMm: number; weightGrams: number; classificationId: string };
export type ResolvedShipment = { destination: Destination; packages: PackedParcel[]; declaredValue: number };
export type DeliveryOption = { carrierId: number; carrierName: string; logisticType: string; serviceCode: string; serviceName: string; amountMinor: string; currency: string; pickupPoints?: { id: number; description: string }[] };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid response');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 150): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error('Invalid text');
  return value.trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid integer');
  return value;
}
export function validateZipnovaConfig(config: ZipnovaConfig): void {
  integer(config.accountId, 1, Number.MAX_SAFE_INTEGER);
  integer(config.originId, 1, Number.MAX_SAFE_INTEGER);
  text(config.source);
  if (typeof config.currency !== 'string' || !/^[A-Z]{3}$/.test(config.currency) || !Number.isInteger(config.exponent) || config.exponent < 0 || config.exponent > 3) throw new Error('Invalid money configuration');
}
export function validateDestination(destination: Destination): void {
  if (!destination || destination.country !== 'AR') throw new Error('Invalid destination');
  text(destination.city); text(destination.state); text(destination.postalCode, 16);
}
function cm(mm: number): number {
  integer(mm, 10, 50000);
  if (mm % 10 !== 0) throw new Error('Fractional centimetre');
  return mm / 10;
}
export function serializeZipnovaQuote(shipment: ResolvedShipment, config: ZipnovaConfig) {
  validateZipnovaConfig(config);
  validateDestination(shipment.destination);
  if (!Array.isArray(shipment.packages) || shipment.packages.length === 0) throw new Error('Missing packages');
  if (!Number.isFinite(shipment.declaredValue) || shipment.declaredValue < 0 || shipment.declaredValue > Number.MAX_SAFE_INTEGER) throw new Error('Invalid declared value');
  minor(shipment.declaredValue, config.exponent);
  return {
    account_id: config.accountId, origin_id: config.originId, source: text(config.source), declared_value: shipment.declaredValue,
    destination: { city: text(shipment.destination.city), state: text(shipment.destination.state), zipcode: text(shipment.destination.postalCode, 16) },
    packages: shipment.packages.map(p => ({ width: cm(p.widthMm), height: cm(p.heightMm), length: cm(p.lengthMm), weight: integer(p.weightGrams, 10, 10000000), classification_id: text(p.classificationId) })),
  };
}
function minor(value: unknown, exponent: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error('Invalid price');
  const decimal = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(decimal)) throw new Error('Invalid price');
  const [whole, fraction = ''] = decimal.split('.');
  if (fraction.length > exponent) throw new Error('Invalid precision');
  const amount = BigInt(whole) * 10n ** BigInt(exponent) + BigInt((fraction + '0'.repeat(exponent)).slice(0, exponent) || '0');
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsafe price');
  return amount.toString();
}
export function parseZipnovaQuote(body: unknown, config: ZipnovaConfig): DeliveryOption[] {
  validateZipnovaConfig(config);
  const results = record(body).all_results;
  if (!Array.isArray(results)) throw new Error('Missing results');
  const options: DeliveryOption[] = [];
  for (const result of results) {
    const row = record(result);
    if (typeof row.selectable !== 'boolean') throw new Error('Invalid availability');
    if (!row.selectable) continue;
    if (row.impediments != null && (!Array.isArray(row.impediments) || row.impediments.length)) continue;
    const carrier = record(row.carrier), service = record(row.service_type), amounts = record(row.amounts);
    const serviceCode = text(service.code);
    let pickupPoints: DeliveryOption['pickupPoints'];
    if (serviceCode === 'pickup_point') {
      if (!Array.isArray(row.pickup_points) || !row.pickup_points.length) continue;
      pickupPoints = row.pickup_points.map(point => {
        const p = record(point);
        return { id: integer(p.point_id, 1, Number.MAX_SAFE_INTEGER), description: text(p.description) };
      });
    }
    options.push({ carrierId: integer(carrier.id, 1, Number.MAX_SAFE_INTEGER), carrierName: text(carrier.name), logisticType: text(row.logistic_type), serviceCode, serviceName: text(service.name), amountMinor: minor(amounts.price_incl_tax, config.exponent), currency: config.currency, ...(pickupPoints ? { pickupPoints } : {}) });
  }
  return options;
}
