import { formatPrice } from '../../../shared/cart/cart';
import type { ShippingOption } from '../../../shared/shipping/shipping-client';

type Choice = { index: number; option: ShippingOption };
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}

/** Stable native radios/details: only a changed quote replaces controls, never a selection. */
export function mountShippingOptions(root: HTMLFieldSetElement, select: (index: number, pointId?: number) => void, restoreFocus: () => void) {
  const content = node('div'); root.append(content);
  let rendered = '';
  const controls = new Map<string, { input: HTMLInputElement; disclosures: HTMLDetailsElement[] }>();
  function radio(index: number, disclosures: HTMLDetailsElement[], pointId?: number) {
    const input = node('input'); input.type = 'radio'; input.name = 'cart-shipping-choice';
    input.value = pointId === undefined ? String(index) : `${index}:${pointId}`;
    input.addEventListener('change', () => { if (input.checked) select(index, pointId); });
    controls.set(input.value, {input, disclosures}); return input;
  }
  function card({index, option}: Choice, disclosures: HTMLDetailsElement[]) {
    const price = formatPrice(BigInt(option.amountMinor), option.currency);
    const description = node('span', '', 'cart-shipping-description');
    description.append(node('strong', option.carrierName), node('span', option.serviceName));
    if (option.serviceCode !== 'pickup_point') {
      const label = node('label', '', 'cart-shipping-choice');
      label.append(radio(index, disclosures), description, node('strong', price, 'cart-shipping-price')); return label;
    }
    const wrapper = node('div', '', 'cart-shipping-pickup');
    const header = node('div', '', 'cart-shipping-service'); header.append(description, node('strong', price, 'cart-shipping-price'));
    const points = node('details', '', 'cart-shipping-points');
    points.append(node('summary', `Ver puntos de retiro (${option.pickupPoints?.length ?? 0})`));
    for (const point of option.pickupPoints ?? []) {
      const label = node('label', '', 'cart-shipping-point'), input = radio(index, [...disclosures, points], point.id);
      input.setAttribute('aria-label', `${option.carrierName} · ${point.description} · ${price}`);
      label.append(input, node('span', point.description)); points.append(label);
    }
    wrapper.append(header, points); return wrapper;
  }
  return {
    update(choices: Choice[], choiceKey: string | null) {
      const key = JSON.stringify(choices);
      if (key !== rendered) {
        const hadFocus = root.contains(document.activeElement);
        rendered = key; controls.clear(); content.replaceChildren();
        for (const pickup of [false, true]) {
          const group = choices.filter(({option}) => (option.serviceCode === 'pickup_point') === pickup);
          if (!group.length) continue;
          const section = node('section', '', 'cart-shipping-group');
          section.append(node('h4', pickup ? 'Retirar en un punto' : 'Envío a domicilio'));
          const more = node('details', '', 'cart-shipping-more');
          more.append(node('summary', pickup ? 'Ver más opciones de retiro' : 'Ver más opciones de envío'));
          group.forEach((choice, index) => {
            if (index < 2) section.append(card(choice, [])); else more.append(card(choice, [more]));
          });
          if (group.length > 2) section.append(more);
          content.append(section);
        }
        if (hadFocus) restoreFocus();
      }
      root.hidden = choices.length === 0;
      for (const [key, {input, disclosures}] of controls) {
        input.checked = key === choiceKey;
        if (input.checked) for (const disclosure of disclosures) disclosure.open = true;
      }
    },
  };
}
