/** Public image order is fixed by SSR. Failed images remain neutral, never replaced with invented media. */
export function mountProductGallery(root: ParentNode) {
  const gallery = root.querySelector<HTMLElement>('[data-product-gallery]');
  if (!gallery) return () => {};
  const images = Array.from(gallery.querySelectorAll<HTMLImageElement>('[data-product-image]'));
  const thumbnails = Array.from(gallery.querySelectorAll<HTMLButtonElement>('[data-gallery-thumb]'));
  const placeholder = gallery.querySelector<HTMLElement>('[data-gallery-placeholder]');
  const label = gallery.querySelector<HTMLElement>('[data-gallery-position]');
  const previous = gallery.querySelector<HTMLButtonElement>('[data-gallery-previous]'), next = gallery.querySelector<HTMLButtonElement>('[data-gallery-next]');
  const illustration = gallery.querySelector<HTMLElement>('[data-gallery-illustration]');
  let index = 0;
  const failed = new Set<number>();
  const render = () => {
    images.forEach((image, position) => { image.hidden = position !== index || failed.has(position); });
    thumbnails.forEach((thumb, position) => thumb.setAttribute('aria-pressed', String(position === index)));
    const visible = !!images[index] && !failed.has(index);
    if (placeholder) placeholder.hidden = visible;
    if (illustration) illustration.hidden = !visible;
    if (label) label.textContent = `Imagen ${index + 1} de ${images.length}`;
  };
  const move = (step: number) => { if (images.length > 1) { index = (index + step + images.length) % images.length; render(); } };
  const back = () => move(-1), forward = () => move(1);
  const thumbHandlers = thumbnails.map((thumb, position) => {
    const select = () => { index = position; render(); };
    thumb.disabled = false; thumb.addEventListener('click', select);
    return () => thumb.removeEventListener('click', select);
  });
  const keyboard = (event: KeyboardEvent) => {
    if (images.length > 1 && ['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
  };
  const handlers = images.map((image, position) => {
    const fail = () => { failed.add(position); render(); }; image.addEventListener('error', fail);
    if (image.complete && !image.naturalWidth) failed.add(position);
    return () => image.removeEventListener('error', fail);
  });
  if (previous) { previous.disabled = false; previous.addEventListener('click', back); }
  if (next) { next.disabled = false; next.addEventListener('click', forward); }
  gallery.addEventListener('keydown', keyboard); render();
  return () => { handlers.forEach(cleanup => cleanup()); thumbHandlers.forEach(cleanup => cleanup()); previous?.removeEventListener('click', back); next?.removeEventListener('click', forward); gallery.removeEventListener('keydown', keyboard); };
}
