import { assignmentPatch, variantInput, type VariantDraft } from '../../form-validation';

export function variantFormInput(read: (name: string) => string, changed: { material: boolean; color: boolean }) {
  const draft = Object.fromEntries(['sku', 'name', 'price', 'currency', 'supplyMode'].map(name => [name, read(name)])) as VariantDraft;
  return { ...variantInput(draft), ...assignmentPatch('materialId', changed.material, read('materialId') || null),
    ...assignmentPatch('colorId', changed.color, read('colorId') || null) };
}
