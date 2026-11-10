import { createVariationRow, notifyVariantOptions, readVariantOptions } from './variant-options';

type Property = { node: HTMLElement; name(): string; value(): string; custom: boolean };
type Owner = { close(): void; dirty(): boolean; busy(): boolean; cancelLabel?: string };

/** Native modal supplies keyboard containment and keeps the product behind it inert. */
export function mountVariantDrawer(form: HTMLFormElement, owner: Owner) {
  const doc = form.ownerDocument, slot = form.parentElement!;
  const catalog = JSON.parse(form.dataset.propertyCatalog || '[]') as { name: string; values: string[] }[];
  const key = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('es');
  const dialog = doc.createElement('dialog'); dialog.className = 'variant-drawer'; dialog.dataset.variantDrawer = '';
  dialog.setAttribute('aria-labelledby', 'variant-drawer-title');
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
    const el = doc.createElement(tag); el.className = className; el.textContent = text; return el;
  };
  const button = (text: string, action: () => void, className = '') => {
    const el = make('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el;
  };
  const title = make('h2', '', 'Propiedades'); title.id = 'variant-drawer-title'; title.tabIndex = -1;
  const eyebrow = make('span', 'eyebrow', form.dataset.inlineVariant ? 'Editar variante' : 'Agregar variante');
  const titleGroup = make('div', ''); titleGroup.append(eyebrow, title);
  const header = make('header', 'variant-drawer-header');
  const closeButton = button('×', () => requestClose(), 'variant-drawer-close'); closeButton.setAttribute('aria-label', 'Cerrar panel de variante');
  header.append(titleGroup, closeButton);
  const progress = make('p', 'variant-drawer-progress', '1. Propiedades · 2. Precio y detalles');
  const message = make('p', 'notice error'); message.dataset.variantDrawerMessage = ''; message.setAttribute('role', 'alert'); message.tabIndex = -1; message.hidden = true;
  const body = make('div', 'variant-drawer-body'), footer = make('div', 'variant-drawer-footer');
  const chooser = make('section', 'variant-property-chooser'), list = make('div', 'variant-property-list');
  chooser.append(make('p', 'editor-caption', 'Material de impresión y una propiedad adicional. Cada variante combina un valor de cada una.'), list);
  const propertyView = make('section', 'variant-property-value'); propertyView.hidden = true;
  propertyView.append(make('p', 'editor-caption', 'Elegí el valor que corresponde a esta variante.'));
  const details = form.querySelector<HTMLElement>('[data-variant-details]')!; details.hidden = true;
  const summary = make('div', 'variant-drawer-summary'); details.prepend(summary);
  const defaults = [...form.querySelectorAll<HTMLElement>('[data-variant-property]')];
  const customList = form.querySelector<HTMLElement>('[data-variations]')!;
  const properties: Property[] = defaults.filter(node => node.dataset.variantProperty === 'material' || node.querySelector('select')!.value || catalog.some(p => key(p.name) === 'color')).map(node => {
    const select = node.querySelector('select')!;
    return { node, custom: false, name: () => node.dataset.variantProperty === 'material' ? 'Material' : 'Color',
      value: () => select.value ? select.selectedOptions[0]?.textContent ?? 'Valor seleccionado' : '' };
  });
  const addCustom = (node: HTMLElement) => {
    const value = node.querySelector<HTMLInputElement>('[data-variation-value]')!;
    node.dataset.propertyEnabled = String(!!value.value.trim());
    const property = { node, custom: true, name: () => node.querySelector<HTMLInputElement>('[data-variation-name]')!.value.trim() || 'Nueva propiedad', value: () => value.value.trim() };
    const name = node.querySelector<HTMLInputElement>('[data-variation-name]')!;
    const known = catalog.find(p => key(p.name) === key(name.value));
    if (known) {
      name.value = known.name; name.readOnly = true; name.closest('label')!.hidden = true;
      const values = make('div', 'variant-property-values');
      const mark = () => { for (const choice of values.querySelectorAll('button')) choice.setAttribute('aria-pressed', String(key(choice.textContent ?? '') === key(value.value))); };
      for (const option of known.values) values.append(button(option, () => { value.value = option; value.dispatchEvent(new Event('input', { bubbles: true })); }, 'variant-value-choice'));
      value.addEventListener('input', mark); mark();
      const label = node.querySelectorAll('label')[1]; label.before(make('p', 'editor-caption', 'Elegí un valor existente o escribí uno nuevo para esta variante.'), values);
    }
    properties.push(property); node.hidden = true; return property;
  };
  [...customList.querySelectorAll<HTMLElement>('[data-variation-row]')].forEach(addCustom);
  for (const group of catalog.filter(p => key(p.name) !== 'color')) if (!properties.some(p => key(p.name()) === key(group.name))) {
    const node = createVariationRow(doc); node.querySelector<HTMLInputElement>('[data-variation-name]')!.value = group.name; customList.append(node); addCustom(node);
  }
  defaults.forEach(node => { node.hidden = true; propertyView.append(node); }); propertyView.append(customList);
  const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  save.classList.add('primary'); save.hidden = true;
  const back = button('Volver', () => showChooser()); back.hidden = true;
  const next = button('Continuar', () => advance(), 'primary');
  const cancel = button(owner.cancelLabel ?? 'Cancelar', () => requestClose());
  footer.append(back, cancel, next, save);
  const discard = make('div', 'variant-drawer-discard'); discard.hidden = true;
  discard.append(make('p', '', 'Hay cambios sin guardar. ¿Querés descartarlos?'),
    button('Seguir editando', () => { discard.hidden = true; closeButton.focus(); }), button('Descartar cambios', () => owner.close(), 'danger'));
  body.append(progress, message, chooser, propertyView, details); footer.prepend(discard);
  form.querySelector('[data-variant-form-title]')?.remove(); form.querySelector('[data-default-properties]')?.remove();
  form.querySelector('.custom-variations')?.remove(); form.querySelector('.admin-actions')?.remove();
  form.replaceChildren(body, footer); dialog.append(header, form); slot.replaceChildren(dialog);
  let step: 'properties' | 'value' | 'details' | 'type' = 'properties', selected: Property | undefined;
  const typeView = make('section', 'variant-property-types'); typeView.hidden = true; body.append(typeView);
  const addProperty = button('+ Agregar propiedad', () => {
    if (properties.length >= 2) { report('Este producto usa Material y una sola propiedad adicional.'); return; }
    clearMessage(); step = 'type'; title.textContent = 'Agregar propiedad'; chooser.hidden = propertyView.hidden = details.hidden = true; typeView.hidden = false;
    back.hidden = false; next.hidden = save.hidden = true; title.focus();
  }, 'link-button');
  typeView.append(make('p', 'editor-caption', 'Elegí la segunda propiedad de este producto.'),
    button('Color', () => { const node = defaults.find(n => n.dataset.variantProperty === 'color')!; const select = node.querySelector('select')!;
      const property = { node, custom: false, name: () => 'Color', value: () => select.value ? select.selectedOptions[0]?.textContent ?? '' : '' };
      properties.push(property); typeView.hidden = true; openProperty(property); }),
    button('Otra propiedad (Diseño, Tamaño…)', () => { const row = createVariationRow(doc); customList.append(row); const property = addCustom(row); typeView.hidden = true; openProperty(property); row.querySelector('input')?.focus(); }));
  const clearMessage = () => { message.hidden = true; message.textContent = ''; };
  const report = (text: string) => { message.textContent = text; message.hidden = false; message.focus(); };
  const renderList = () => {
    list.replaceChildren(); summary.replaceChildren();
    for (const property of properties) {
      const row = make('div', 'variant-property-item');
      const pick = button('', () => openProperty(property), 'variant-property-pick');
      const value = property.value(), label = property.name();
      const text = make('span', ''); text.append(make('strong', '', label), make('small', '', value || (label === 'Material' ? 'Obligatorio · PLA, PETG…' : 'Elegir valor')));
      const known = catalog.find(p => key(p.name) === key(label));
      if (known?.values.length) text.append(make('small', '', known.values.join(' · ')));
      pick.append(text, make('span', 'variant-property-chevron', '›')); row.append(pick);
      if (label !== 'Material' && !known) {
        const remove = button('×', () => removeProperty(property), 'variant-property-remove'); remove.setAttribute('aria-label', `Quitar propiedad ${label}`); row.append(remove);
      }
      list.append(row);
      if (value) summary.append(make('span', 'badge', `${label}: ${value}`));
    }
    addProperty.hidden = properties.length >= 2;
  };
  function removeProperty(property: Property) {
    if (property.custom) { properties.splice(properties.indexOf(property), 1); property.node.remove(); notifyVariantOptions(form); }
    else { const select = property.node.querySelector('select')!; select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); properties.splice(properties.indexOf(property), 1); property.node.hidden = true; }
    renderList();
  }
  function showChooser() {
    clearMessage(); step = 'properties'; title.textContent = 'Propiedades'; chooser.hidden = false; propertyView.hidden = details.hidden = typeView.hidden = true;
    back.hidden = save.hidden = true; next.hidden = false; next.textContent = 'Continuar'; renderList(); title.focus();
  }
  function openProperty(property: Property) {
    clearMessage(); selected = property; step = 'value'; title.textContent = property.name(); chooser.hidden = details.hidden = true; propertyView.hidden = false;
    properties.forEach(p => { p.node.hidden = p !== property; });
    if (property.custom) property.node.dataset.propertyEnabled = 'true';
    back.hidden = false; save.hidden = true; next.hidden = false; next.textContent = 'Usar valor'; title.focus();
  }
  function advance() {
    clearMessage();
    if (step === 'type') return;
    if (step === 'value') {
      if (!selected?.value()) { report('Elegí o escribí un valor para esta propiedad.'); return; }
      if (selected.custom && !selected.node.querySelector<HTMLInputElement>('[data-variation-name]')!.value.trim()) { report('Escribí el nombre de la propiedad.'); return; }
      try { readVariantOptions(form); } catch (error) { report((error as Error).message); return; }
      showChooser(); return;
    }
    try { readVariantOptions(form); } catch (error) { report((error as Error).message); return; }
    if (!defaults[0].querySelector('select')!.value) { report('Elegí el material de impresión para continuar.'); return; }
    if (properties.length > 2 || properties.some(property => !property.value())) { report('Elegí un valor para la propiedad adicional. Cada variante usa un solo valor.'); return; }
    step = 'details'; chooser.hidden = propertyView.hidden = true; details.hidden = false; title.textContent = 'Precio y detalles';
    back.hidden = false; next.hidden = true; save.hidden = false; renderList(); title.focus();
  }
  chooser.append(addProperty);
  const submit = (event: Event) => { if (step !== 'details') { event.preventDefault(); event.stopPropagation(); advance(); } };
  function requestClose() {
    if (owner.busy()) return;
    if (owner.dirty()) { discard.hidden = false; discard.querySelector('button')?.focus(); }
    else owner.close();
  }
  const escape = (event: Event) => { event.preventDefault(); requestClose(); };
  const backdrop = (event: Event) => { if (event.target === dialog) requestClose(); };
  form.addEventListener('submit', submit); dialog.addEventListener('cancel', escape); dialog.addEventListener('click', backdrop);
  const labels = new MutationObserver(renderList);
  defaults.forEach(node => labels.observe(node.querySelector('select')!, { childList: true, subtree: true, characterData: true }));
  renderList(); dialog.showModal(); title.focus();
  return { requestClose, dispose() { labels.disconnect(); form.removeEventListener('submit', submit); dialog.removeEventListener('cancel', escape); dialog.removeEventListener('click', backdrop); dialog.close(); dialog.remove(); } };
}
