import type { Product, Variant } from '../catalog/storefront-types';
import { currencyFractionDigits } from '../../catalog/shared/money';

export type CommerceEvent = 'view_item_list' | 'select_item' | 'view_item' | 'add_to_cart' | 'remove_from_cart' | 'view_cart' | 'begin_checkout' | 'add_shipping_info' | 'add_payment_info';
export type CommerceItem = { item_id: string; item_name: string; item_variant?: string; item_category?: string; price?: number; quantity: number };
export type CommerceData = { currency?: string; value?: number; items: CommerceItem[]; item_list_id?: string; shipping_tier?: string; payment_type?: string };
export type AnalyticsContext = { consent: true; measurementId: string; clientId: string; sessionId: string; revocationToken: string };
export type AnalyticsBridge = { track(event: CommerceEvent, data: CommerceData): boolean; context(): Promise<AnalyticsContext | null> };
type AnalyticsWindow = Window & { maliAnalytics?: AnalyticsBridge };

export function itemData(product: Pick<Product, 'id' | 'name' | 'category'>, variant?: Variant | null, quantity = 1): CommerceItem {
  return { item_id: product.id, item_name: product.name.slice(0, 100), quantity,
    ...(variant ? { item_variant: variant.id, price: variant.priceMinor / 10 ** currencyFractionDigits(variant.currency) } : {}),
    ...(product.category ? { item_category: product.category.name.slice(0, 100) } : {}) };
}
export function commerceData(lines: { product: Product | null; variant: Variant | null; quantity: number }[]): CommerceData | null {
  if (!lines.length || lines.length > 200 || lines.some(l => !l.product || !l.variant || !Number.isSafeInteger(l.quantity) || l.quantity < 1)) return null;
  const currency = lines[0].variant!.currency;
  if (lines.some(l => l.variant!.currency !== currency)) return null;
  const minor = lines.reduce((n, l) => n + BigInt(l.variant!.priceMinor) * BigInt(l.quantity), 0n);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { currency, value: Number(minor) / 10 ** currencyFractionDigits(currency), items: lines.map(l => itemData(l.product!, l.variant!, l.quantity)) };
}
/** No queue: actions before consent are deliberately not replayed. Analytics can never break a purchase. */
export function trackCommerce(event: CommerceEvent, data: CommerceData | null): boolean {
  try { return !!data && typeof window !== 'undefined' && !!(window as AnalyticsWindow).maliAnalytics?.track(event, data); } catch { return false; }
}
export function onAnalyticsReady(action: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('mali:analytics-ready', action);
  return () => window.removeEventListener('mali:analytics-ready', action);
}
export async function checkoutAnalyticsContext(): Promise<AnalyticsContext | null> {
  try { return typeof window === 'undefined' ? null : await (window as AnalyticsWindow).maliAnalytics?.context() ?? null; } catch { return null; }
}
