import type { AdminSection } from '../navigation';

/** Fixed same-origin, server-escaped HTML boundary. Arbitrary strings elsewhere must use textContent. */
export function readAdminSection(document: Document, id: AdminSection, html: string): HTMLElement {
  const template = document.createElement('template'); template.innerHTML = html;
  const section = template.content.firstElementChild;
  if (template.content.children.length !== 1 || !section?.matches(`section[data-admin-section="${id}"]`)
    || template.content.querySelector('script, iframe, object, embed, base, link, style, meta, template')) throw new Error('El servicio devolvió una vista inválida.');
  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    if (Array.from(element.attributes).some(attribute => /^on/i.test(attribute.name) || attribute.name === 'srcdoc')) throw new Error('El servicio devolvió una vista inválida.');
  }
  return section as HTMLElement;
}
