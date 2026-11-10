/** Enhance only server-rendered, eligible controls. Product links remain usable without JavaScript. */
export function mountCatalogGalleries(root: ParentNode = document, onImage?: (card: HTMLElement, image: HTMLImageElement | null) => void) {
  const cleanup: Array<() => void> = [];
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
      let index = 0; const failed = new Set<number>(); let animations: Animation[] = [];
      const stop = () => { const active = animations; animations = []; active.forEach(animation => animation.cancel()); };
      const render = () => {
        onImage?.(card, failed.has(index) ? null : images[index]);
        images.forEach((image, i) => { image.hidden = i !== index || failed.has(i); });
        if (placeholder) placeholder.hidden = !failed.has(index);
        if (position) position.textContent = `Imagen ${index + 1} de ${images.length}`;
      };
      const move = (step: -1 | 1) => {
        stop(); render(); const old = index; index = (index + step + images.length) % images.length;
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
  return () => cleanup.forEach(dispose => dispose());
}
