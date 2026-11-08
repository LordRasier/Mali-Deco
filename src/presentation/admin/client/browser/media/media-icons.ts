const paths = {
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
  edit: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z',
  remove: 'm6 6 12 12M6 18 18 6',
} as const;

/** Fixed SVG paths only; user text remains in the button's accessible label. */
export function mediaIcon(button: HTMLButtonElement, kind: keyof typeof paths, label: string) {
  button.className = `media-icon media-icon-${kind}`;
  button.setAttribute('aria-label', label); button.title = label;
  const svg = button.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = button.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[kind]); svg.append(path); button.replaceChildren(svg);
}
