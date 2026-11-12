import { blockDefinitions, blockStyleChoices, type LandingBlock } from '../../../../../shared/landing-layout';
import { colorControl } from './appearance-controls';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
export function blockButton(text: string, action: string, id: string) { const button = el('button', text); button.type = 'button'; button.dataset.blockAction = action; button.dataset.blockId = id; return button; }
const labels: Record<string, string> = { title: 'Título', eyebrow: 'Texto superior', accent: 'Texto destacado del título', description: 'Descripción', action: 'Texto del botón', href: 'Destino del enlace', alt: 'Descripción accesible de la imagen', note: 'Nota inferior', caption: 'Epígrafe', empty: 'Mensaje sin productos', columns: 'Columnas en escritorio', mobileColumns: 'Columnas en móvil', limit: 'Máximo de productos', width: 'Ancho', spacing: 'Espaciado', theme: 'Fondo', align: 'Alineación', radius: 'Esquinas' };
const values: Record<string, string> = { contained: 'Centrado', full: 'Ancho completo', none: 'Ninguno', small: 'Pequeño', medium: 'Mediano', large: 'Grande', inherit: 'Original del bloque', light: 'Blanco', muted: 'Suave', brand: 'Color de marca', dark: 'Oscuro', left: 'Izquierda', center: 'Centro', right: 'Derecha', soft: 'Suaves', round: 'Redondeadas', category: 'Automáticos por categoría', manual: 'Selección manual', featured: 'Productos destacados' };
export function landingControls(block: LandingBlock, path: string) {
  const root = el('div'); root.className = 'content-properties'; root.dataset.blockInspector = block.id;
  const actions = el('div'); actions.className = 'content-actions';
  for (const [action, title] of [['up', '↑ Subir'], ['down', '↓ Bajar'], ['duplicate', 'Duplicar'], ['remove', 'Quitar']]) actions.append(blockButton(title, action, block.id)); root.append(actions);
  const check = el('label', 'Mostrar este bloque'); check.className = 'content-checkbox'; const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = block.enabled; enabled.dataset.contentPath = path + '.enabled'; check.prepend(enabled); root.append(check);
  const select = (key: string, current: string | number, choices: readonly string[], fieldPath: string, title = labels[key]) => {
    const label = el('label', title); label.className = 'content-field'; const input = el('select'); input.dataset.contentPath = fieldPath; input.setAttribute('aria-label', title);
    if (typeof current === 'number') input.dataset.number = 'true';
    for (const value of choices) { const option = el('option', values[value] ?? value); option.value = value; input.append(option); } input.value = String(current); label.append(input); root.append(label); return input;
  };
  if (block.type === 'container') { const input = select('columns', block.columns.length, ['1', '2', '3'], '', 'Columnas (en móvil se apilan)'); delete input.dataset.contentPath; input.dataset.blockColumns = block.id; root.append(el('small', 'Al reducir columnas, sus bloques pasan a la última columna conservada.')); }
  for (const [key, value] of Object.entries(block.props)) {
    const fieldPath = `${path}.props.${key}`;
    if (key === 'cardStyle') {
      const input = select(key, String(value), ['icons', 'photo', 'circles'], fieldPath, 'Diseño de las categorías');
      ['Tarjetas con iconos', 'Tarjetas con foto', 'Imágenes circulares'].forEach((label, i) => { input.options[i].textContent = label; });
      root.append(el('small', 'La imagen, la descripción y el icono se editan en Clasificaciones → Categorías. Sin foto se muestra el icono.')); continue;
    }
    if (key === 'textPosition') {
      if (block.props.cardStyle === 'photo') {
        const input = select(key, String(value), ['below', 'center'], fieldPath, 'Ubicación del texto');
        input.options[0].textContent = 'Debajo de la imagen'; input.options[1].textContent = 'En el centro, sobre la imagen';
      }
      continue;
    }
    if (key === 'image' || key === 'mobileImage') {
      const label = el('label', key === 'image' ? 'Imagen' : 'Imagen para móvil (opcional)'); label.className = 'content-field';
      if (value) { const img = el('img'); img.src = String(value).replace('/catalog/content-media/', '/admin/settings/content/media/'); img.alt = ''; img.className = 'block-image-thumbnail'; label.append(img); }
      const input = el('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.dataset.blockUpload = key; input.dataset.blockId = block.id; label.append(input, el('small', 'JPG, PNG o WebP · hasta 5 MB')); root.append(label);
      if (value) { const remove = blockButton('Quitar imagen', 'clear-image', block.id); remove.dataset.key = key; root.append(remove); } continue;
    }
    if (key === 'mode') { select(key, String(value), ['category', 'manual', 'featured'], fieldPath, 'Origen de los productos'); if (value === 'featured') root.append(el('small', 'Solo productos publicados marcados como Destacado en Productos, en orden alfabético. Para elegir un orden propio, use Selección manual.')); continue; }
    if (key === 'category') { if (block.props.mode === 'category') { const input = select(key, String(value), [''], fieldPath, 'Categoría'); input.dataset.categorySelect = ''; input.firstElementChild!.textContent = 'Todas las categorías'; } continue; }
    if (Array.isArray(value)) {
      if (key === 'productIds' && block.props.mode !== 'manual') continue;
      const picker = el('div'); picker.dataset.blockPicker = key; picker.dataset.blockId = block.id; picker.append(el('strong', key === 'productIds' ? 'Productos elegidos' : 'Categorías elegidas'));
      picker.append(el('p', key === 'categoryIds' ? 'Sin selección se muestran las primeras 24 categorías con productos.' : 'El orden de esta lista es el orden de las tarjetas.'));
      const chosen = el('div'); chosen.dataset.pickerChosen = ''; picker.append(chosen);
      if (key === 'productIds') { const search = el('input'); search.type = 'search'; search.placeholder = 'Buscar productos publicados'; search.setAttribute('aria-label', 'Buscar productos publicados'); search.dataset.pickerSearch = ''; picker.append(search); }
      const results = el('div'); results.dataset.pickerResults = ''; results.className = 'block-picker-results'; picker.append(results); root.append(picker); continue;
    }
    if (typeof value === 'number') { select(key, value, Array.from({ length: key === 'limit' ? 24 : key === 'mobileColumns' ? 2 : 4 }, (_, i) => String(i + 1)), fieldPath); continue; }
    const label = el('label', labels[key] ?? key); label.className = 'content-field'; const input = el('textarea'); input.rows = key === 'description' ? 4 : 2; input.maxLength = 3000; input.value = value; input.dataset.contentPath = fieldPath; label.append(input); root.append(label);
  }
  root.append(el('h3', 'Estilo del bloque'));
  root.append(colorControl(`${path}.style.backgroundColor`, block.style.backgroundColor, 'Fondo de la sección'));
  root.append(colorControl(`${path}.style.textColor`, block.style.textColor, 'Texto de la sección', '#111217'));
  root.append(el('small', 'Los colores personalizados reemplazan el tema. Sin un color de texto propio, un fondo personalizado usa texto claro u oscuro automáticamente.'));
  for (const [key, choices] of Object.entries(blockStyleChoices)) select(key, block.style[key as keyof typeof blockStyleChoices], choices, `${path}.style.${key}`, key === 'width' ? 'Ancho del contenido' : labels[key]);
  root.prepend(el('p', blockDefinitions[block.type].hint)); return root;
}
