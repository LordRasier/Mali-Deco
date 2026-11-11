import { storeFonts, type StoreAppearance } from '../../../../../shared/store-appearance';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
export function colorControl(path: string, value: string | null, title: string, fallback = '#ffffff') {
  const group = el('div'); group.className = 'content-color-field';
  const label = el('label', title); label.className = 'content-field';
  const input = el('input'); input.type = 'color'; input.value = value ?? fallback; input.dataset.contentPath = path; input.setAttribute('aria-label', title);
  const output = el('output', value ?? 'Original'); output.setAttribute('aria-live', 'polite');
  input.addEventListener('input', () => { output.textContent = input.value; });
  const row = el('span'); row.className = 'content-color-row'; row.append(input, output); label.append(row);
  const reset = el('button', 'Restablecer'); reset.type = 'button'; reset.dataset.contentReset = path; reset.disabled = value === null;
  reset.setAttribute('aria-label', 'Restablecer ' + title.toLowerCase()); group.append(label, reset); return group;
}
export function appearanceControls(appearance: StoreAppearance) {
  const root = el('div'); root.className = 'content-properties';
  root.append(el('p', 'Se aplica a todas las páginas. Los cambios solo llegan a la tienda al publicar.'));
  root.append(colorControl('appearance.backgroundColor', appearance.backgroundColor, 'Fondo general'));
  root.append(el('small', 'Las secciones con fondo propio conservan su color.'));
  root.append(el('h3', 'Tipografías'));
  for (const [key, title] of [['headingFont', 'Títulos'], ['bodyFont', 'Texto']] as const) {
    const label = el('label', title); label.className = 'content-field';
    const input = el('select'); input.dataset.contentPath = `appearance.${key}`; input.dataset.nullable = 'true'; input.setAttribute('aria-label', title);
    const original = el('option', 'Original de la tienda'); original.value = ''; input.append(original);
    for (const [id, font] of Object.entries(storeFonts)) { const option = el('option', font.label); option.value = id; input.append(option); }
    input.value = appearance[key] ?? ''; label.append(input); root.append(label);
    const sample = el('p', 'Aa · Diseño y objetos'); sample.className = 'content-font-sample'; sample.dataset.font = appearance[key] ?? appearance.bodyFont ?? 'figtree'; root.append(sample);
  }
  root.append(el('small', 'Catálogo de la plataforma, sin cargas de fuentes ni servicios externos. Los botones y precios conservan la tipografía de acento de la tienda.'));
  return root;
}
