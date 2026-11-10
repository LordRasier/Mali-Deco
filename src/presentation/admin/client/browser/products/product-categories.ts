import type { sessionStore } from '../../session-store';
import type { TaxonomyItem } from '../../types';
import { mountTaxonomySelect } from '../taxonomy-select';

/** Refresh options in place; never recreate the form or infer a changed assignment. */
export function mountProductCategories(root: HTMLElement, session: typeof sessionStore,
  disabled: (control: HTMLSelectElement | HTMLButtonElement, value: boolean) => void,
  load?: (signal: AbortSignal) => Promise<TaxonomyItem[]>) {
  return mountTaxonomySelect(root, session, disabled, { kind: 'categories', select: '[data-product-category]',
    message: '[data-product-category-message]', button: '[data-product-action="categories"]' }, load);
}
