/** Sharing never publishes content or changes a selected variant. */
export function mountCatalogSharing(root: ParentNode = document) {
  const cleanup: Array<() => void> = [];
  const menus = Array.from(root.querySelectorAll<HTMLDetailsElement>('[data-product-share]'));
  for (const menu of menus) {
    const actions = menu.querySelector<HTMLElement>('[data-share-actions]'), basic = menu.querySelector<HTMLElement>('[data-share-basic]');
    const whatsapp = menu.querySelector<HTMLAnchorElement>('[data-share-whatsapp]');
    const instagram = menu.querySelector<HTMLButtonElement>('[data-share-instagram]'), copy = menu.querySelector<HTMLButtonElement>('[data-share-copy]');
    const status = menu.querySelector<HTMLElement>('[data-share-status]'), fallback = menu.querySelector<HTMLElement>('[data-share-fallback]'), input = menu.querySelector<HTMLInputElement>('[data-share-url]');
    if (!actions || !basic || !whatsapp || !instagram || !copy || !status || !fallback || !input) continue;
    const path = menu.dataset.sharePath ?? '';
    if (!/^\/catalogo\?articulo=[a-zA-Z0-9_-]{1,80}#producto-[a-zA-Z0-9_-]{1,80}$/.test(path)) continue;
    let origin = window.location.origin;
    try { const configured = new URL(menu.dataset.shareOrigin ?? ''); if (configured.protocol === 'https:' && !configured.username && !configured.password) origin = configured.origin; } catch { /* Local previews use their own origin. */ }
    const url = new URL(path, origin).href, title = menu.dataset.shareName ?? 'Artículo';
    input.value = url; whatsapp.href = 'https://wa.me/?text=' + encodeURIComponent(title + '\n' + url);
    actions.hidden = false; basic.hidden = true;
    const manual = (message: string) => { fallback.hidden = false; status.textContent = message; input.focus(); input.select(); };
    const copyLink = async (forInstagram = false) => {
      try {
        if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        fallback.hidden = true; status.textContent = forInstagram ? 'Enlace copiado. Pégalo en un mensaje de Instagram.' : 'Enlace copiado.';
      } catch { manual('Copia este enlace para compartir el artículo.'); }
    };
    const onCopy = () => { void copyLink(); };
    let sharing = false;
    const onInstagram = async () => {
      if (sharing) return;
      status.textContent = ''; fallback.hidden = true;
      if (typeof navigator.share !== 'function') { await copyLink(true); return; }
      sharing = true;
      try { await navigator.share({ title, text: title, url }); }
      catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) manual('No se pudo abrir el menú de compartir. Copia el enlace para pegarlo en Instagram.'); }
      finally { sharing = false; }
    };
    const toggle = () => { if (menu.open) for (const other of menus) if (other !== menu) other.open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.open) { event.preventDefault(); menu.open = false; menu.querySelector('summary')?.focus(); }
    };
    copy.addEventListener('click', onCopy); instagram.addEventListener('click', onInstagram); menu.addEventListener('toggle', toggle); menu.addEventListener('keydown', escape);
    cleanup.push(() => { copy.removeEventListener('click', onCopy); instagram.removeEventListener('click', onInstagram); menu.removeEventListener('toggle', toggle); menu.removeEventListener('keydown', escape); });
  }
  const outside = (event: Event) => { for (const menu of menus) if (!menu.contains(event.target as Node)) menu.open = false; };
  document.addEventListener('pointerdown', outside); cleanup.push(() => document.removeEventListener('pointerdown', outside));
  const focus = () => {
    const target = root.querySelector<HTMLElement>('[data-shared-product]');
    if (target && (!window.location.hash || window.location.hash === '#' + target.id)) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  };
  const shown = (event: PageTransitionEvent) => { if (!event.persisted) focus(); };
  focus(); window.addEventListener('hashchange', focus); window.addEventListener('pageshow', shown);
  cleanup.push(() => { window.removeEventListener('hashchange', focus); window.removeEventListener('pageshow', shown); });
  return () => cleanup.forEach(dispose => dispose());
}
