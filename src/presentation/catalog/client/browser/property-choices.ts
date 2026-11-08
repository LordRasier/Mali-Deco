import { matchProperty, propertyKey, selectionGroups, variantProperties } from '../../shared/variant-properties';
import type { Variant } from '../../shared/storefront-types';

const views = new WeakMap<HTMLElement, { variants: Variant[]; selected?: Variant }>();
export function renderPropertyChoices(root: HTMLElement, variants: Variant[], choose: (id: string) => void) {
  const groups = selectionGroups(variants); views.delete(root);
  if (!groups.length) return false;
  root.replaceChildren(); root.hidden = false; root.classList.add('variant-property-choices');
  const view = { variants, selected: undefined as Variant | undefined }; views.set(root, view);
  for (const group of groups) {
    const section = document.createElement('div'); section.className = 'variant-property-group'; section.setAttribute('role', 'group'); section.setAttribute('aria-label', group.name);
    const label = document.createElement('span'); label.className = 'variant-property-label'; label.textContent = `${group.name}:`;
    const values = document.createElement('div'); values.className = 'variant-property-values'; section.append(label, values);
    if (propertyKey(group.name) === 'material' && group.values.length === 1) {
      const material = document.createElement('span'); material.className = 'variant-property-material'; material.textContent = group.values[0]; values.append(material);
    } else for (const value of group.values) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'variant-property-choice'; button.textContent = value;
      button.dataset.propertyName = group.name; button.dataset.propertyValue = value; button.setAttribute('aria-label', `${group.name}: ${value}`);
      button.addEventListener('click', () => { const variant = matchProperty(view.variants, view.selected, group.name, value); if (variant) choose(variant.id); });
      values.append(button);
    }
    root.append(section);
  }
  updatePropertyChoices(root, undefined, false); return true;
}
export function updatePropertyChoices(root: HTMLElement, selected: Variant | undefined | null, pending: boolean) {
  const view = views.get(root); if (!view) return false;
  view.selected = selected ?? undefined;
  const values = selected ? variantProperties(selected) : [];
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-property-value]')) {
    button.disabled = pending;
    button.setAttribute('aria-pressed', String(values.some(p => propertyKey(p.name) === propertyKey(button.dataset.propertyName!) && propertyKey(p.value) === propertyKey(button.dataset.propertyValue!))));
  }
  return true;
}
