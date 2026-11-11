import { contentAt, type ContentTree } from './content-state';
import { contentElement as el } from './content-controls';
import { contentParent } from './content-selection';
import { blockDefinitions, type LandingBlock } from '../../../../../shared/landing-layout';

/** Native disclosures keep the tree compact; selecting the canvas opens its containing branch. */
export function renderContentOutline(root: HTMLElement, draft: ContentTree, target: string, selected: string) {
  const samePage = root.dataset.page === target;
  const open = new Map(Array.from(root.querySelectorAll<HTMLDetailsElement>('[data-content-branch]')).map(node => [node.dataset.contentBranch!, node.open]));
  const selectionChanged = root.dataset.selection !== selected || !samePage;
  root.dataset.page = target; root.dataset.selection = selected; root.replaceChildren();
  const branch = (host: HTMLElement, key: string, label: string, initial = false) => {
    const node = el('details'); node.dataset.contentBranch = key; node.className = 'content-tree-branch';
    node.open = samePage ? open.get(key) ?? initial : initial;
    node.append(el('summary', label)); const children = el('div'); children.className = 'content-tree-children'; node.append(children); host.append(node); return children;
  };
  const button = (host: HTMLElement, path: string, label: string, disabled = false) => {
    const node = el('button', label); node.type = 'button'; node.dataset.contentSelect = path;
    const chosen = path === selected || path === contentParent(selected);
    node.setAttribute('aria-pressed', String(chosen)); node.title = label;
    if (disabled) { const badge = el('small', 'Oculto'); badge.className = 'content-tree-state'; node.append(badge); }
    host.append(node);
    if (chosen && selectionChanged) for (let parent = host.parentElement; parent && parent !== root; parent = parent.parentElement) if (parent.tagName === 'DETAILS') (parent as HTMLDetailsElement).open = true;
    return node;
  };
  const list = (host: HTMLElement, path: string, label: string) => {
    const items = contentAt(draft, path); if (!Array.isArray(items)) return;
    const children = branch(host, path, `${label} (${items.length})`);
    button(children, path, 'Administrar ' + label.toLowerCase());
    items.forEach((item, index) => {
      const row = item as ContentTree, name = String(row.title || row.label || `Elemento ${index + 1}`), itemPath = `${path}.${index}`;
      const destination = path === 'footer.columns' ? branch(children, itemPath, name) : children;
      const node = button(destination, itemPath, path === 'footer.columns' ? 'Título y visibilidad' : name, row.enabled === false);
      node.draggable = true; node.dataset.dragList = path; node.dataset.dragIndex = String(index);
      if (path === 'footer.columns') list(destination, itemPath + '.links', 'Enlaces');
    });
  };
  const heading = el('h2', target === 'home' ? 'Inicio' : target === 'catalog' ? 'Listado de productos' : String(contentAt(draft, `pages.${target}.label`)));
  heading.className = 'content-tree-title'; root.append(heading);
  const header = branch(root, 'header', 'Encabezado · compartido');
  button(header, 'blocks.header', 'Navegación y carrito'); button(header, 'source.brand', 'Nombre y color'); button(header, 'source.logo', 'Logo');
  const page = branch(root, 'page', 'Contenido de esta página', true);
  if (target === 'home') {
    button(page, 'landing', 'Agregar y ordenar bloques');
    const blocks = (host: HTMLElement, items: LandingBlock[], path: string) => items.forEach((block, index) => {
      const current = `${path}.${index}`, title = String(block.props.title || blockDefinitions[block.type].label);
      const row = button(host, current, title, !block.enabled); row.dataset.builderMove = block.id;
      block.columns.forEach((column, n) => blocks(branch(host, column.id, `Columna ${n + 1}`, true), column.blocks, `${current}.columns.${n}.blocks`));
    });
    blocks(page, contentAt(draft, 'landing.blocks') as LandingBlock[] ?? [], 'landing.blocks');
  } else if (target === 'catalog') {
    button(page, 'copy.catalog', 'Título y presentación'); button(page, 'listing', 'Diseño del listado'); button(page, 'blocks.listing.cards', 'Tarjetas de producto'); button(page, 'blocks.listing.labels', 'Textos del listado'); button(page, 'features.catalog', 'Activar catálogo y rutas');
  } else {
    button(page, `pages.${target}`, 'Título, presentación y publicación'); list(page, `pages.${target}.sections`, 'Secciones');
    button(page, 'blocks.information.help', 'Ayuda y contacto'); button(page, 'blocks.information.legal', 'Datos del responsable');
  }
  const footer = branch(root, 'footer', 'Pie de página · compartido');
  button(footer, 'footer', 'Presentación y visibilidad'); list(footer, 'footer.benefits', 'Beneficios'); list(footer, 'footer.columns', 'Columnas');
  const settings = branch(root, 'settings', 'Otros ajustes compartidos');
  button(settings, 'contact', 'Contacto y datos fiscales'); button(settings, 'features', 'Funciones y rutas');
  for (const [key, label] of [['product', 'Textos de producto'], ['information', 'Textos de ayuda'], ['cart', 'Carrito'], ['email', 'Emails']]) button(settings, `copy.${key}`, label);
}
