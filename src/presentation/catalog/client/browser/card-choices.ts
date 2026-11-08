import { cardOptions } from '../../shared/card-options';
import { catalogColor } from '../../shared/catalog-color';
import type { Product, Variant } from '../../shared/storefront-types';
import { renderPropertyChoices, updatePropertyChoices } from './property-choices';

/** Rebuild only when the set of options changes, preserving focus during selection. */
export function renderCardChoices(root: HTMLElement, product: Product, choose: (id: string) => void, more: (trigger: HTMLElement) => void) {
  root.replaceChildren();
  if (product.variantCount === product.variants.length && renderPropertyChoices(root, product.variants, choose)) { root.dataset.cardOptionKind = 'properties'; return; }
  const choices = cardOptions(product);
  root.dataset.cardOptionKind = choices.kind;
  const label = document.createElement('span'); label.className = 'catalog-choice-label'; label.dataset.cardSelected = '';
  label.textContent = choices.kind === 'colors' ? 'Color' : 'Opciones'; root.append(label);
  const button = (label: string, action: (button: HTMLButtonElement) => void) => {
    const control = document.createElement('button'); control.type = 'button'; control.textContent = label;
    control.addEventListener('click', () => action(control)); root.append(control); return control;
  };
  if (choices.kind === 'colors' || choices.kind === 'buttons') {
    root.setAttribute('role', 'group'); root.setAttribute('aria-label', `Opciones de ${product.name}`);
    for (const variant of choices.visible) {
      const control = button(variant.name, () => choose(variant.id)); control.dataset.cardChoice = variant.id;
      control.setAttribute('aria-pressed', 'false');
      if (choices.kind === 'colors') {
        control.className = 'catalog-swatch'; control.textContent = '';
        const circle = document.createElement('span'); circle.style.backgroundColor = catalogColor(variant.colorInfo?.hex); control.append(circle);
        control.setAttribute('aria-label', variant.colorInfo!.name); control.title = variant.colorInfo!.name;
      }
    }
  } else if (choices.kind === 'select') {
    const select = document.createElement('select'); select.setAttribute('aria-label', `Opciones de ${product.name}`);
    select.dataset.cardSelect = ''; select.add(new Option('Elegí una opción', ''));
    for (const option of choices.options) select.add(new Option(option.name, option.id));
    select.addEventListener('change', () => choose(select.value)); root.append(select);
  }
  if (choices.hasMore) button(choices.kind === 'more' ? 'Ver opciones' : `+${choices.options.length - choices.visible.length} colores`, more);
  if (choices.kind === 'colors') {
    const hint = document.createElement('small'); hint.className = 'catalog-help'; hint.textContent = 'Las fotos muestran el producto, no el color elegido.'; root.append(hint);
  }
  root.hidden = choices.kind === 'single' || choices.kind === 'none';
}

export function updateCardChoices(root: HTMLElement, selected: Variant | undefined, pending: boolean) {
  if (root.dataset.cardOptionKind === 'properties' && updatePropertyChoices(root, selected, pending)) return;
  for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
    button.disabled = pending;
    if (button.dataset.cardChoice) button.setAttribute('aria-pressed', String(selected?.id === button.dataset.cardChoice));
  }
  const select = root.querySelector<HTMLSelectElement>('[data-card-select]');
  if (select) { select.disabled = pending; select.value = selected?.id ?? ''; }
  const label = root.querySelector<HTMLElement>('[data-card-selected]');
  if (label) label.textContent = root.dataset.cardOptionKind === 'colors'
    ? selected ? `Color: ${selected.colorInfo?.name ?? selected.name}` : 'Color' : 'Opciones';
}
