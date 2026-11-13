/** Navigation stays visible; optional search preserves disclosure and focus rules. */
export function mountSiteHeader(root = document.querySelector<HTMLElement>('[data-site-header]')) {
  if (!root) return;
  const brand = root.querySelector<HTMLElement>('[data-brand-display]');
  const logo = brand?.querySelector<HTMLImageElement>('[data-brand-logo]'), name = brand?.querySelector<HTMLElement>('[data-brand-name]');
  const showBrand = () => { if (logo && name) { const missing = logo.naturalWidth <= 1; logo.hidden = missing; name.hidden = !missing && brand?.getAttribute('data-brand-display') === 'logo'; } };
  const logoError = () => { if (logo && name) { logo.hidden = true; name.hidden = false; } };
  if (logo) { if (logo.complete) showBrand(); logo.addEventListener('load', showBrand); logo.addEventListener('error', logoError); }
  const stopBrand = logo ? () => { logo.removeEventListener('load', showBrand); logo.removeEventListener('error', logoError); } : undefined;
  const search = root.querySelector<HTMLButtonElement>('[data-search-toggle]');
  const form = root.querySelector<HTMLFormElement>('#store-search');
  if (!search && !form) return stopBrand;
  if (!search || !form) { stopBrand?.(); throw Error('Incomplete site header'); }
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
    stopBrand?.();
    search.removeEventListener('click', toggleSearch);
    root.removeEventListener('keydown', escape); root.removeEventListener('focusout', leave);
  };
}
