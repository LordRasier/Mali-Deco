import { ApiError } from '../../api';
import { canManageCatalog } from '../../session-core';
import type { sessionStore } from '../../session-store';
import { currencyFractionDigits, minorToDecimal } from '../../money';
import { markupFromAmounts } from '../../../shared/pricing-calculator';
import { mountPricingFields, pricingControls, readPricing } from './pricing-fields';
import type { AdminProductsRuntime, ProductMutationLease } from './product-controller';

type Baseline = { salePriceMinor?: string | null; priceMinor: string; costMinor: string | null; currency: string; supplyMode: string | null; stockQuantity: number };
type Owner = { reserve(): ProductMutationLease | null; busy(value: boolean): void; changed(): void; canCreate(): boolean; created(): void };
export function mountProductPricing(root: HTMLElement, session: typeof sessionStore, runtime: AdminProductsRuntime, owner: Owner) {
  const disposers: (() => void)[] = [], drafts: (() => boolean)[] = [];
  const epoch = session.getEpoch(); let active = true;
  const current = () => active && session.getEpoch() === epoch && session.getSnapshot().status === 'authenticated' && canManageCatalog(session.getSnapshot().user);
  for (const group of root.querySelectorAll<HTMLElement>('[data-pricing-fields]')) {
    const fields = mountPricingFields(group, group.dataset.pricingCurrency ?? 'ARS');
    if (fields) disposers.push(fields.dispose);
  }
  for (const form of root.querySelectorAll<HTMLFormElement>('[data-pricing-form]')) {
    const c = pricingControls(form), save = form.querySelector<HTMLButtonElement>('[data-pricing-save]'), note = form.querySelector<HTMLElement>('[data-pricing-note]');
    if (!c || !save || !note) continue;
    let baseline: Baseline = { priceMinor: form.dataset.priceMinor ?? '', costMinor: form.dataset.costMinor || null, salePriceMinor: form.dataset.salePriceMinor || null,
      currency: form.dataset.pricingCurrency ?? 'ARS', supplyMode: form.dataset.supplyMode || null, stockQuantity: Number(form.dataset.stockQuantity ?? 0) };
    let review = false, writing = false;
    const values = () => JSON.stringify([c.cost.value, c.markup.value, c.sale.value, c.discount?.value ?? '', c.unlimited.checked, c.unlimited.checked ? '' : c.stock.value]);
    let original = values();
    const pending = () => writing || review || values() !== original;
    drafts.push(pending);
    const changed = () => { save.hidden = !pending(); save.disabled = review || writing; if (!review) note.textContent = pending() ? 'Cambios sin guardar.' : ''; owner.changed(); };
    const submit = async (event: Event) => {
      event.preventDefault(); if (!current() || writing || review || !pending()) return;
      const id = form.dataset.variantId, productId = root.dataset.productId, csrf = session.getSnapshot().csrf;
      if (!productId || !csrf || (!id && !owner.canCreate())) return;
      let data: ReturnType<typeof readPricing>;
      try { data = readPricing(form, baseline.currency); } catch (error) { note.textContent = error instanceof Error ? error.message : 'Revisá los valores.'; return; }
      const lease = owner.reserve(); if (!lease) return;
      const accepts = () => current() && lease.current();
      const modeChanged = data.supplyMode !== baseline.supplyMode;
      const stockChanged = data.stockQuantity !== undefined && data.stockQuantity !== baseline.stockQuantity;
      const body = id ? { ...(data.salePriceMinor !== undefined ? { salePriceMinor: data.salePriceMinor, expectedSalePriceMinor: baseline.salePriceMinor ?? null } : {}), priceMinor: data.priceMinor, costMinor: data.costMinor, supplyMode: data.supplyMode,
        expectedPriceMinor: baseline.priceMinor, expectedCostMinor: baseline.costMinor, expectedCurrency: baseline.currency, expectedSupplyMode: baseline.supplyMode,
        ...(modeChanged || stockChanged ? { stockQuantity: data.stockQuantity ?? baseline.stockQuantity, expectedStockQuantity: baseline.stockQuantity } : {}) }
        : { ...data, sku: form.dataset.variantSku ?? '', name: 'Estándar' };
      writing = true; owner.busy(true); note.textContent = 'Guardando…';
      try {
        const result = await runtime.request(`/admin/catalog/products/${encodeURIComponent(productId)}/variants${id ? '/' + encodeURIComponent(id) + '/pricing' : ''}`, { method: id ? 'PUT' : 'POST', body, csrf });
        if (!accepts()) return;
        const receipt = result as Baseline & { id: string; productId: string };
        if (!receipt || !receipt.id || (id && receipt.id !== id) || receipt.productId !== productId || receipt.priceMinor !== String(data.priceMinor)
          || (data.salePriceMinor !== undefined && (receipt.salePriceMinor ?? null) !== (data.salePriceMinor === null ? null : String(data.salePriceMinor)))
          || receipt.costMinor !== (data.costMinor === null ? null : String(data.costMinor)) || receipt.currency !== baseline.currency || receipt.supplyMode !== data.supplyMode
          || !Number.isInteger(receipt.stockQuantity) || receipt.stockQuantity < 0 || receipt.stockQuantity > 1000000
          || (data.stockQuantity !== undefined && (modeChanged || stockChanged) && receipt.stockQuantity !== data.stockQuantity)) throw Error('No se pudo confirmar el guardado. Volvé a abrir el producto para revisar sus valores.');
        baseline = receipt;
        if (c.discount) c.discount.value = receipt.salePriceMinor == null ? '' : minorToDecimal(receipt.salePriceMinor, receipt.currency).replace('.', ',');
        c.sale.value = minorToDecimal(receipt.priceMinor, receipt.currency).replace('.', ',');
        c.cost.value = receipt.costMinor === null ? '' : minorToDecimal(receipt.costMinor, receipt.currency).replace('.', ',');
        c.markup.value = markupFromAmounts(receipt.costMinor, receipt.priceMinor); c.stock.value = String(receipt.stockQuantity);
        original = values(); save.hidden = true; note.textContent = 'Cambios guardados.';
        form.dataset.priceMinor = receipt.priceMinor; form.dataset.salePriceMinor = receipt.salePriceMinor ?? '';
        const summary = root.querySelector<HTMLElement>('[data-preview-price]');
        const forms = [...root.querySelectorAll<HTMLFormElement>('[data-pricing-form]')];
        if (summary && root.querySelector('[data-pricing-complete="true"]') && forms.every(f => f.dataset.pricingCurrency === receipt.currency)) {
          const prices = forms.map(f => f.dataset.salePriceMinor ? Math.min(Number(f.dataset.priceMinor), Number(f.dataset.salePriceMinor)) : Number(f.dataset.priceMinor)).filter(Number.isSafeInteger);
          if (prices.length) summary.textContent = (new Set(prices).size > 1 ? 'Desde ' : '') + new Intl.NumberFormat('es-AR', { style: 'currency', currency: receipt.currency }).format(Math.min(...prices) / 10 ** currencyFractionDigits(receipt.currency));
        }
        if (!id) { writing = false; owner.busy(false); lease.release(); owner.created(); }
      } catch (error) {
        if (!accepts()) return;
        if (error instanceof ApiError && error.status === 401) { session.expire(); return; }
        review = !(error instanceof ApiError) || error.status === 409 || error.status === 0 || error.status >= 500;
        note.textContent = error instanceof ApiError && error.status === 409
          ? 'Los valores cambiaron (por ejemplo, una venta descontó stock). Conservamos tus cambios: volvé a abrir el producto para revisar antes de guardar.'
          : error instanceof Error ? error.message : 'No se pudo guardar.';
      } finally {
        if (accepts()) { writing = false; owner.busy(false); save.disabled = review; owner.changed(); }
        lease.release();
      }
    };
    const onSubmit = (event: Event) => { void submit(event); };
    form.addEventListener('input', changed); form.addEventListener('change', changed); form.addEventListener('submit', onSubmit);
    disposers.push(() => { form.removeEventListener('input', changed); form.removeEventListener('change', changed); form.removeEventListener('submit', onSubmit); });
  }
  return { pending: () => drafts.some(check => check()), dispose() { active = false; disposers.forEach(stop => stop()); } };
}
