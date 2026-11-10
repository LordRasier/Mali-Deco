/** A separate photo dialog: never changes the product's selected option or information view. */
export function mountCatalogZoom(root: ParentNode = document) {
  const dialog = root.querySelector<HTMLDialogElement>('[data-zoom-dialog]');
  const noop: { update(card: HTMLElement, image: HTMLImageElement | null): void; dispose(): void } = { update() {}, dispose() {} };
  if (!dialog || typeof dialog.showModal !== 'function') return noop;
  const find = <T extends HTMLElement>(key: string) => {
    const node = dialog.querySelector<T>(`[data-zoom-${key}]`); if (!node) throw Error(`Missing photo control: ${key}`); return node;
  };
  const title = find('title'), close = find<HTMLButtonElement>('close'), toggle = find<HTMLButtonElement>('toggle');
  const viewport = find('viewport'), image = find<HTMLImageElement>('image'), error = find('error'), retry = find<HTMLButtonElement>('retry');
  const cleanup: Array<() => void> = [];
  let trigger: HTMLAnchorElement | undefined, fallback: HTMLElement | null = null, overflow = '', source = '', zoomed = false;
  const zoom = (value: boolean) => {
    zoomed = value; viewport.classList.toggle('is-zoomed', value); toggle.setAttribute('aria-pressed', String(value));
    toggle.textContent = value ? 'Ajustar imagen' : 'Ampliar 2×'; viewport.scrollTop = 0; viewport.scrollLeft = 0;
  };
  const load = () => { zoom(false); image.hidden = false; error.hidden = true; retry.hidden = true; toggle.disabled = true; image.src = source; };
  const onLoad = () => { if (dialog.open) toggle.disabled = false; };
  const onError = () => { if (dialog.open) { image.hidden = true; error.hidden = false; retry.hidden = false; toggle.disabled = true; } };
  const onClose = () => {
    if (!trigger) return;
    document.documentElement.style.overflow = overflow;
    const target = trigger.isConnected ? trigger : fallback; trigger = undefined; source = ''; image.removeAttribute('src'); zoom(false);
    target?.focus({ preventScroll: true });
  };
  const onToggle = () => { if (!toggle.disabled) zoom(!zoomed); }, onClickClose = () => dialog.close();
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const controls = [close, viewport, toggle, retry].filter(node => !node.hidden && !('disabled' in node && node.disabled)), last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === close) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); close.focus(); }
  };
  dialog.addEventListener('close', onClose); dialog.addEventListener('keydown', onKey);
  close.addEventListener('click', onClickClose); toggle.addEventListener('click', onToggle); retry.addEventListener('click', load);
  image.addEventListener('load', onLoad); image.addEventListener('error', onError);
  for (const card of root.querySelectorAll<HTMLElement>('[data-catalog-card]')) {
    const link = card.querySelector<HTMLAnchorElement>('[data-card-zoom]'); if (!link) continue;
    link.setAttribute('aria-haspopup', 'dialog');
    const open = (event: MouseEvent) => {
      if (event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || link.hidden || dialog.open) return;
      event.preventDefault(); trigger = link; fallback = card.querySelector<HTMLElement>('[data-card-link]');
      source = link.href; title.textContent = link.dataset.zoomName ?? 'Imagen del producto'; image.alt = title.textContent;
      overflow = document.documentElement.style.overflow; dialog.showModal(); document.documentElement.style.overflow = 'hidden';
      load(); close.focus({ preventScroll: true });
    };
    link.addEventListener('click', open); cleanup.push(() => link.removeEventListener('click', open));
  }
  return {
    update(card: HTMLElement, current: HTMLImageElement | null) {
      const link = card.querySelector<HTMLAnchorElement>('[data-card-zoom]'); if (!link) return;
      const url = current?.dataset.zoomSrc; link.hidden = !url; if (url) link.href = url;
    },
    dispose() {
      if (dialog.open) { dialog.close(); onClose(); }
      cleanup.forEach(clean => clean()); dialog.removeEventListener('close', onClose); dialog.removeEventListener('keydown', onKey);
      close.removeEventListener('click', onClickClose); toggle.removeEventListener('click', onToggle); retry.removeEventListener('click', load);
      image.removeEventListener('load', onLoad); image.removeEventListener('error', onError);
    },
  };
}
