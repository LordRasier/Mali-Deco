import type { CommerceData, CommerceEvent, CommerceItem } from '../../shared/analytics/commerce';

const names = new Set(['view_item_list', 'select_item', 'view_item', 'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info']);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100 && !/[\p{Cc}<>@]/u.test(v);
/** Explicit projection: never forward contacts, addresses, search terms or arbitrary payload fields. */
export function cleanCommerce(event: CommerceEvent, input: CommerceData): CommerceData | null {
  if (!names.has(event) || !input || !Array.isArray(input.items) || !input.items.length || input.items.length > 200) return null;
  const items: CommerceItem[] = [];
  for (const item of input.items) {
    if (!item || !text(item.item_id) || !text(item.item_name) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return null;
    const clean: CommerceItem = { item_id: item.item_id, item_name: item.item_name, quantity: item.quantity };
    if (item.price !== undefined) { if (!Number.isFinite(item.price) || item.price < 0) return null; clean.price = item.price; }
    for (const key of ['item_variant', 'item_category'] as const) if (text(item[key])) clean[key] = item[key];
    items.push(clean);
  }
  const result: CommerceData = { items };
  if (input.value !== undefined) {
    if (!Number.isFinite(input.value) || input.value < 0 || !/^[A-Z]{3}$/.test(input.currency ?? '')) return null;
    result.value = input.value; result.currency = input.currency;
  }
  for (const key of ['item_list_id', 'shipping_tier', 'payment_type'] as const) if (text(input[key])) result[key] = input[key];
  return result;
}
