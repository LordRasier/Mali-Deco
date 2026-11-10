import { assignmentPatch, dimensionFields, productInput, type ProductDraft } from '../../form-validation';
import { bulkWarningInput } from './inventory-form';

/** Read native control values, including disabled category controls, without clearing unchanged assignments. */
export function productFormInput(read: (name: string) => string, categoryChanged: boolean) {
  const draft = Object.fromEntries(['name', 'slug', 'description', 'status', ...dimensionFields.map(([name]) => name)].map(name => [name, read(name)])) as ProductDraft;
  return { ...productInput(draft), ...bulkWarningInput(read('bulkWarningThreshold'), read('bulkWarningMessage')), ...assignmentPatch('categoryId', categoryChanged, read('categoryId') || null) };
}
