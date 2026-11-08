/** Navigation stays visible; optional search preserves disclosure and focus rules. */
export function mountSiteHeader(root = document.querySelector<HTMLElement>('[data-site-header]')) {
  if (!root) return;
  const search = root.querySelector<HTMLButtonElement>('[data-search-toggle]');
  const form = root.querySelector<HTMLFormElement>('#store-search');
  if (!search && !form) return;
  if (!search || !form) throw Error('Incomplete site header');
  let open = false;
  const render = () => {
    search.setAttribute('aria-expanded', String(open));
    search.setAttribute('aria-label', open ? 'Cerrar búsqueda' : 'Buscar');
    form.hidden = !open;
  };
  const toggleSearch = () => { open = !open; render(); if (open) form.querySelector<HTMLInputElement>('input')?.focus(); };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault(); open = false; render(); search.focus();
  };
  const leave = (event: FocusEvent) => { if (!root.contains(event.relatedTarget as Node | null)) { open = false; render(); } };
  search.addEventListener('click', toggleSearch);
  root.addEventListener('keydown', escape); root.addEventListener('focusout', leave);
  render(); search.disabled = false;
  return () => {
    search.removeEventListener('click', toggleSearch);
    root.removeEventListener('keydown', escape); root.removeEventListener('focusout', leave);
  };
}
