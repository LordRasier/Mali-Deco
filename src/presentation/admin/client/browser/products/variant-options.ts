export function readVariantOptions(form: HTMLFormElement) {
  const names = new Set(['material', 'color']);
  const rows = [...form.querySelectorAll<HTMLElement>('[data-variation-row]')].filter(row => row.dataset?.propertyEnabled !== 'false');
  const result = rows.flatMap(row => {
    const name = row.querySelector<HTMLInputElement>('[data-variation-name]')!.value.trim().normalize('NFC');
    const value = row.querySelector<HTMLInputElement>('[data-variation-value]')!.value.trim().normalize('NFC');
    if (!name && !value) return [];
    if (!name || !value) throw Error('Completá el nombre y el valor de cada variación, o quitá la fila.');
    if (name.length > 60 || value.length > 100 || /[\p{Cc}\p{Cf}]/u.test(name + value)) throw Error('Revisá el nombre y el valor de la variación.');
    const key = name.toLocaleLowerCase('es');
    if (names.has(key)) throw Error('No repitas una variación. Material y Color tienen sus propios campos.');
    names.add(key); return [{ name, value }];
  });
  if (result.length > 1) throw Error('Elegí una sola propiedad adicional y un valor para esta variante.');
  return result;
}

export function notifyVariantOptions(form: HTMLFormElement) {
    const name = form.querySelector<HTMLInputElement>('[name="name"]')!;
    if (form.dataset.autoVariantName === 'true') {
      const values = [...form.querySelectorAll<HTMLSelectElement>('[data-variant-material],[data-variant-color]')]
        .filter(select => !!select.value).map(select => select.selectedOptions[0]?.textContent ?? '');
      values.push(...[...form.querySelectorAll<HTMLInputElement>('[data-variation-value]')].filter(input => input.closest<HTMLElement>('[data-variation-row]')?.dataset.propertyEnabled !== 'false').map(input => input.value.trim()).filter(Boolean));
      name.value = values.join(' / ').slice(0, 255);
      name.dispatchEvent(new Event('input', { bubbles: true }));
    } else name.dispatchEvent(new Event('change', { bubbles: true }));
}

export function createVariationRow(doc: Document) {
  const row = doc.createElement('div'); row.className = 'variation-row'; row.dataset.variationRow = '';
  for (const [labelText, attr, placeholder, max] of [['Propiedad', 'variationName', 'Ej.: Tamaño', 60], ['Valor', 'variationValue', 'Ej.: Grande', 100]] as const) {
    const label = doc.createElement('label'); label.textContent = labelText;
    const input = doc.createElement('input'); input.name = attr; input.dataset[attr] = ''; input.maxLength = max; input.placeholder = placeholder;
    label.append(input); row.append(label);
  }
  const remove = doc.createElement('button'); remove.type = 'button'; remove.dataset.variationRemove = ''; remove.textContent = 'Quitar'; remove.setAttribute('aria-label', 'Quitar variación');
  row.append(remove); return row;
}

/** Delegate to the retained product root so freshly opened inline forms work too. */
export function mountVariantOptions(root: HTMLElement) {
  const doc = root.ownerDocument;
  const click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-variation-add],[data-variation-remove]');
    const form = button?.closest<HTMLFormElement>('[data-variant-form]'); if (!button || !form) return;
    if (button.hasAttribute('data-variation-remove')) button.closest('[data-variation-row]')?.remove();
    else {
      const list = form.querySelector<HTMLElement>('[data-variations]')!; if (list.children.length >= 8) return;
      const row = createVariationRow(doc); list.append(row); row.querySelector('input')?.focus();
    }
    notifyVariantOptions(form);
  };
  const change = (event: Event) => {
    const target = event.target as HTMLInputElement, form = target.closest<HTMLFormElement>('[data-variant-form]'); if (!form) return;
    if (target.name === 'name' && event.isTrusted) form.dataset.autoVariantName = 'false';
    if (target.matches('[data-variation-name],[data-variation-value],[data-variant-material],[data-variant-color]')) notifyVariantOptions(form);
  };
  root.addEventListener('click', click); root.addEventListener('input', change); root.addEventListener('change', change);
  return () => { root.removeEventListener('click', click); root.removeEventListener('input', change); root.removeEventListener('change', change); };
}
