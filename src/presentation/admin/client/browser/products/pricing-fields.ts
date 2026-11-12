import { decimalToMinor } from '../../money';
import { calculatePricing, markupBasis, type PricingField } from '../../../shared/pricing-calculator';

export function pricingControls(root: HTMLElement) {
  const cost = root.querySelector<HTMLInputElement>('[data-pricing-cost]'), markup = root.querySelector<HTMLInputElement>('[data-pricing-markup]');
  const sale = root.querySelector<HTMLInputElement>('[data-pricing-sale]'), stock = root.querySelector<HTMLInputElement>('[data-pricing-stock]');
  const discount = root.querySelector<HTMLInputElement>('[data-pricing-discount]');
  const unlimited = root.querySelector<HTMLInputElement>('[data-pricing-unlimited]'), supply = root.querySelector<HTMLInputElement>('[data-pricing-supply]');
  if (!cost || !markup || !sale || !stock || !unlimited || !supply) return;
  return { cost, markup, sale, discount, stock, unlimited, supply };
}
export function readPricing(root: HTMLElement, currency: string) {
  const c = pricingControls(root); if (!c) throw Error('No se pudo leer el precio.');
  if (c.markup.value.trim() && markupBasis(c.markup.value) === undefined) throw Error('La ganancia debe estar entre -100 y 100000 %, con hasta dos decimales.');
  const priceMinor = decimalToMinor(c.sale.value.trim(), currency);
  const costMinor = c.cost.value.trim() ? decimalToMinor(c.cost.value.trim(), currency) : null;
  const quantity = c.stock.value.trim();
  if (!c.unlimited.checked && (!/^\d+$/.test(quantity) || Number(quantity) > 1000000)) throw Error('Indicá un stock entero entre 0 y 1000000, o marcá Ilimitado.');
  return { priceMinor, costMinor, ...(c.discount ? { salePriceMinor: c.discount.value.trim() ? decimalToMinor(c.discount.value.trim(), currency) : null } : {}), currency, supplyMode: c.unlimited.checked ? 'made_to_order' as const : 'stock' as const,
    stockQuantity: c.unlimited.checked ? undefined : Number(quantity) };
}
export function mountPricingFields(root: HTMLElement, currency: string) {
  const c = pricingControls(root); if (!c) return;
  const syncStock = () => { c.stock.disabled = c.unlimited.checked; c.supply.value = c.unlimited.checked ? 'made_to_order' : 'stock'; };
  const input = (event: Event) => {
    const changed = (['cost', 'markup', 'sale'] as const).find(key => c[key] === event.target); if (!changed) return;
    const changes = calculatePricing({ cost: c.cost.value, markup: c.markup.value, sale: c.sale.value }, changed, currency);
    for (const [key, value] of Object.entries(changes)) c[key as PricingField].value = value;
  };
  const change = (event: Event) => { if (event.target === c.unlimited) syncStock(); };
  root.addEventListener('input', input); root.addEventListener('change', change); syncStock();
  return { dispose() { root.removeEventListener('input', input); root.removeEventListener('change', change); } };
}
