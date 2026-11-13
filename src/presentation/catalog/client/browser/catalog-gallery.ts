/** Enhance only server-rendered, eligible controls. Product links remain usable without JavaScript. */
export function mountCatalogGalleries(root: ParentNode = document, onImage?: (card: HTMLElement, image: HTMLImageElement | null) => void) {
  const cleanup: Array<() => void> = [];
  const selectors = new Map<HTMLElement, (imageId?: string) => void>();
  for (const card of root.querySelectorAll<HTMLElement>('[data-catalog-card]')) {
    const images = Array.from(card.querySelectorAll<HTMLImageElement>('[data-card-image]'));
    const controls = card.querySelector<HTMLElement>('[data-card-controls]');
    const previous = card.querySelector<HTMLButtonElement>('[data-card-previous]'), next = card.querySelector<HTMLButtonElement>('[data-card-next]');
    const placeholder = card.querySelector<HTMLElement>('[data-card-placeholder]'), position = card.querySelector<HTMLElement>('[data-card-position]');
    if (images.length === 1) {
      const image = images[0];
      const fail = () => { onImage?.(card, null); image.hidden = true; if (placeholder) placeholder.hidden = false; };
      image.addEventListener('error', fail); cleanup.push(() => image.removeEventListener('error', fail));
      if (image.complete && !image.naturalWidth) fail(); else onImage?.(card, image);
    }
    if (controls && previous && next && images.length > 1) {
      let index = Math.max(0, images.findIndex(image => !image.hidden)); const failed = new Set<number>(); let animations: Animation[] = [];
      const stop = () => { const active = animations; animations = []; active.forEach(animation => animation.cancel()); };
      const render = () => {
        onImage?.(card, failed.has(index) ? null : images[index]);
        images.forEach((image, i) => { image.hidden = i !== index || failed.has(i); });
        if (placeholder) placeholder.hidden = !failed.has(index);
        if (position) position.textContent = `Imagen ${index + 1} de ${images.length}`;
      };
      const show = (target: number, step: -1 | 1) => {
        if (target === index) return;
        stop(); render(); const old = index; index = target;
        const outgoing = images[old], incoming = images[index];
        const reduced = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced || failed.has(old) || failed.has(index) || typeof outgoing.animate !== 'function' || typeof incoming.animate !== 'function') { render(); return; }
        onImage?.(card, incoming); incoming.hidden = false;
        if (position) position.textContent = `Imagen ${index + 1} de ${images.length}`;
        const options = { duration: 280, easing: 'ease-in-out' };
        const leave = outgoing.animate([{ transform: 'translateX(0%)' }, { transform: `translateX(${-100 * step}%)` }], options);
        const enter = incoming.animate([{ transform: `translateX(${100 * step}%)` }, { transform: 'translateX(0%)' }], options);
        animations = [leave, enter]; enter.onfinish = () => { animations = []; render(); };
      };
      const move = (step: -1 | 1) => show((index + step + images.length) % images.length, step);
      selectors.set(card, imageId => {
        const target = Math.max(0, images.findIndex(image => image.getAttribute('data-image-id') === imageId));
        show(target, target < index ? -1 : 1);
      });
      const back = () => move(-1), forward = () => move(1);
      previous.addEventListener('click', back); next.addEventListener('click', forward);
      cleanup.push(() => { stop(); render(); previous.removeEventListener('click', back); next.removeEventListener('click', forward); });
      images.forEach((image, i) => {
        const fail = () => { failed.add(i); stop(); render(); };
        image.addEventListener('error', fail); cleanup.push(() => image.removeEventListener('error', fail));
        if (image.complete && !image.naturalWidth) failed.add(i);
      });
      render(); controls.hidden = false;
    }
  }
  return Object.assign(() => { cleanup.forEach(dispose => dispose()); selectors.clear(); }, {
    select: (card: HTMLElement, imageId?: string) => selectors.get(card)?.(imageId),
  });
}
