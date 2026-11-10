import { contentElement as el } from './content-controls';
import { contentAt, type ContentTree } from './content-state';

export const editorPageGroups = [
  { label: 'Tienda', pages: [['home', 'Inicio', '/'], ['catalog', 'Listado de productos', '/catalogo']] },
  { label: 'Información y ayuda', pages: [['sobre-mali', 'Sobre nosotros', '/sobre-nosotros'], ['contacto', 'Contacto', '/contacto'], ['preguntas-frecuentes', 'Preguntas frecuentes', '/preguntas-frecuentes'], ['cuidados', 'Cuidados', '/cuidados'], ['seguimiento', 'Seguimiento', '/seguimiento']] },
  { label: 'Legales y políticas', pages: [['terminos-y-condiciones', 'Términos y condiciones', '/terminos-y-condiciones'], ['politica-de-privacidad', 'Política de privacidad', '/politica-de-privacidad'], ['envios-y-reembolsos', 'Envíos y reembolsos', '/envios-y-reembolsos'], ['cambios-y-devoluciones', 'Cambios y devoluciones', '/cambios-y-devoluciones'], ['arrepentimiento', 'Derecho de arrepentimiento', '/arrepentimiento']] },
];

export function renderContentPages(root: HTMLElement, scope: HTMLSelectElement, draft: ContentTree, target: string) {
  root.replaceChildren(); scope.replaceChildren();
  for (const group of editorPageGroups) {
    const section = el('section'), heading = el('h2', group.label), options = el('optgroup'); options.label = group.label;
    section.className = 'content-page-group'; section.append(heading);
    for (const [key, fallback, route] of group.pages) {
      const name = key === 'home' || key === 'catalog' ? fallback : String(contentAt(draft, `pages.${key}.label`) || fallback);
      const enabled = contentAt(draft, key === 'catalog' ? 'features.catalog' : `pages.${key}.enabled`) !== false;
      const button = el('button'); button.type = 'button'; button.dataset.contentPage = key;
      button.setAttribute('aria-current', key === target ? 'page' : 'false');
      const label = el('span', name), address = el('small', route); label.className = 'content-page-name';
      button.append(label, address); if (!enabled) { const badge = el('span', 'Desactivada'); badge.className = 'content-page-state'; button.append(badge); }
      section.append(button); const option = el('option', name + (enabled ? '' : ' · Desactivada')); option.value = key; options.append(option);
    }
    root.append(section); scope.append(options);
  }
  scope.value = target;
}
