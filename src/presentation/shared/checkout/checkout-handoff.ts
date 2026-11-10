import type { Quote } from './checkout-client';
import type { QuoteLine } from '../shipping/shipping-client';
import type { ShippingSnapshot } from '../shipping/shipping-session';

export const deliveryHintKey = 'checkout-delivery-preference-v1';
const lineKey = (lines: QuoteLine[]) => JSON.stringify(lines.map(({ productId, variantId, quantity }) => [productId, variantId, quantity]));

/** A short-lived preference, never a stored price, quote authority or order input. */
export function createDeliveryHint(snapshot: ShippingSnapshot, choice: string | null, lines: QuoteLine[], now = Date.now()): string | null {
  const quote = snapshot.quote;
  if (snapshot.mode !== 'api' || snapshot.error || snapshot.loading || snapshot.expired || !snapshot.candidateId || !lines.length || !quote || quote.status !== 'quoted' || quote.validUntil <= now || !choice || !/^\d{1,3}(?::[1-9]\d*)?$/.test(choice)) return null;
  const [index, point] = choice.split(':');
  const option = quote.options[Number(index)], pointId = point ? Number(point) : null;
  if (!option || (option.serviceCode === 'pickup_point' ? !option.pickupPoints?.some(value => value.id === pointId) : pointId !== null)) return null;
  return JSON.stringify({ linesKey: lineKey(lines), postalCode: snapshot.postalCode.trim(), candidateId: snapshot.candidateId,
    carrierName: option.carrierName, serviceName: option.serviceName, serviceCode: option.serviceCode, currency: option.currency,
    pointId, validUntil: quote.validUntil });
}

function matchingHint(raw: string | null, lines: QuoteLine[], destination: { postalCode: string; candidateId: string }, now: number) {
  if (!raw || raw.length > 16000) return null;
  try {
    const hint = JSON.parse(raw);
    if (!hint || typeof hint !== 'object' || Array.isArray(hint) || hint.linesKey !== lineKey(lines) || hint.postalCode !== destination.postalCode.trim() || hint.candidateId !== destination.candidateId || !Number.isSafeInteger(hint.validUntil) || hint.validUntil <= now || hint.validUntil > now + 300000) return null;
    if (['carrierName', 'serviceName', 'serviceCode'].some(key => typeof hint[key] !== 'string' || !hint[key].trim() || hint[key].length > 255)
      || typeof hint.currency !== 'string' || !/^[A-Z]{3}$/.test(hint.currency)
      || (hint.serviceCode === 'pickup_point' ? !Number.isSafeInteger(hint.pointId) || hint.pointId < 1 : hint.pointId !== null)) return null;
    return hint as { carrierName: string; serviceName: string; serviceCode: string; currency: string; pointId: number | null };
  } catch { return null; }
}

/** A valid preference permits one quote refresh, never an order or a trusted price. */
export function hasDeliveryPreference(raw: string | null, lines: QuoteLine[], destination: { postalCode: string; candidateId: string }, now = Date.now()): boolean {
  return matchingHint(raw, lines, destination, now) !== null;
}

/** Match exactly one fresh service and an existing pickup point; otherwise ask again. */
export function restoreDeliveryChoice(raw: string | null, lines: QuoteLine[], destination: { postalCode: string; candidateId: string }, quote: Quote, now = Date.now()): { option: string; point: string } | null {
  const hint = matchingHint(raw, lines, destination, now);
  if (!hint || quote.validUntil <= now) return null;
  const matches = quote.options.filter(value => value.carrierName === hint.carrierName && value.serviceName === hint.serviceName && value.serviceCode === hint.serviceCode && value.currency === hint.currency);
  if (matches.length !== 1) return null;
  const option = matches[0];
  if (option.serviceCode === 'pickup_point' ? !option.pickupPoints?.some(value => value.id === hint.pointId) : hint.pointId !== null) return null;
  return { option: option.id, point: hint.pointId === null ? '' : String(hint.pointId) };
}
