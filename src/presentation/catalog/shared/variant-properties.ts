import type { Variant } from './storefront-types';

export const propertyKey = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('es');
export function groupProperties(options: { name: string; value: string }[]) {
  const groups = new Map<string, { name: string; values: string[] }>();
  for (const option of options) {
    const key = propertyKey(option.name); if (!key) continue;
    const group = groups.get(key) ?? { name: option.name.trim(), values: [] };
    if (option.value.trim() && !group.values.some(v => propertyKey(v) === propertyKey(option.value))) group.values.push(option.value.trim());
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Values are separate from property names; selection always resolves an existing SKU. */
export function variantProperties(variant: Variant) {
  return [...(variant.material ? [{ name: 'Material', value: variant.material.name }] : []),
    ...(variant.colorInfo ? [{ name: 'Color', value: variant.colorInfo.name }] : []), ...(variant.options ?? [])];
}
export function selectionGroups(variants: Variant[]) {
  if (!variants.length || variants.some(v => !v.material || (v.options?.length ?? 0) + (v.colorInfo ? 1 : 0) > 1)) return [];
  const groups = groupProperties(variants.flatMap(variantProperties));
  const combinations = variants.map(v => JSON.stringify(variantProperties(v).map(p => [propertyKey(p.name), propertyKey(p.value)])));
  return groups.length <= 2 && variants.every(v => variantProperties(v).length === groups.length)
    && new Set(combinations).size === variants.length ? groups : [];
}
export function matchProperty(variants: Variant[], selected: Variant | undefined | null, name: string, value: string) {
  const match = (variant: Variant) => variantProperties(variant).some(p => propertyKey(p.name) === propertyKey(name) && propertyKey(p.value) === propertyKey(value));
  const candidates = variants.filter(match);
  return candidates.find(v => variantProperties(selected ?? v).every(p => propertyKey(p.name) === propertyKey(name) || variantProperties(v).some(q => propertyKey(q.name) === propertyKey(p.name) && propertyKey(q.value) === propertyKey(p.value)))) ?? candidates[0];
}
