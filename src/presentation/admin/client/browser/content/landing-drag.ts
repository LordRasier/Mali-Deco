import { blockDefinitions, type BlockType, type LandingLayout } from '../../../../../shared/landing-layout';
import { dropBlock, type BlockDrop } from '../../../../../shared/landing-tree';
type Target = { zone: string; index: number };
/** An outer shield bridges the scriptless iframe and toolbox during a gesture. */
export function mountLandingDrag(form: HTMLElement, frame: HTMLIFrameElement, read: () => LandingLayout, editable: () => boolean, commit: (source: BlockDrop, target: Target) => void, notice: (text: string) => void) {
  let source: BlockDrop | undefined, startX = 0, startY = 0, pointer = 0, dragging = false, shield: HTMLDivElement | undefined, ghost: HTMLDivElement | undefined, slot: HTMLDivElement | undefined;
  let target: Target | undefined, attached: Document | null = null, raf = 0, lastX = 0, lastY = 0, suppress = false;
  let pressed: HTMLElement | undefined;
  const clearSlot = () => { slot?.remove(); slot = undefined; target = undefined; };
  const finish = () => { cancelAnimationFrame(raf); clearSlot(); shield?.remove(); ghost?.remove(); shield = ghost = undefined; source = undefined; pressed = undefined; dragging = false; delete form.dataset.blockDragging; };
  const position = () => {
    if (!dragging || !source || !frame.contentDocument || !editable()) return finish();
    const rect = frame.getBoundingClientRect(), scale = rect.width / frame.clientWidth;
    const x = (lastX - rect.left) / scale, y = (lastY - rect.top) / scale, doc = frame.contentDocument;
    if (ghost) { ghost.style.left = `${lastX + 16}px`; ghost.style.top = `${lastY + 16}px`; }
    if (lastX < rect.left || lastX > rect.right || lastY < rect.top || lastY > rect.bottom) { clearSlot(); return; }
    const hit = doc.elementFromPoint(x, y);
    if (slot?.contains(hit)) return;
    const zone = hit?.closest<HTMLElement>('[data-landing-zone]');
    if (!zone) { clearSlot(); return; }
    const children = Array.from(zone.children).filter((node): node is HTMLElement => node instanceof doc.defaultView!.HTMLElement && node.hasAttribute('data-landing-id'));
    let index = children.findIndex(child => y < child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2); if (index < 0) index = children.length;
    const candidate = { zone: zone.dataset.landingZone!, index };
    try { dropBlock(read(), source, candidate.zone, candidate.index, () => 'drag-provisional'); }
    catch { clearSlot(); if (ghost) ghost.dataset.invalid = 'true'; return; }
    if (ghost) ghost.dataset.invalid = 'false';
    if (target?.zone === candidate.zone && target.index === index) return;
    clearSlot(); target = candidate; slot = doc.createElement('div'); slot.className = 'landing-drop-slot'; slot.textContent = 'Soltar aquí'; zone.insertBefore(slot, children[index] ?? null);
  };
  const tick = () => {
    if (!dragging) return;
    const rect = frame.getBoundingClientRect();
    if (lastX >= rect.left && lastX <= rect.right && lastY >= rect.top && lastY <= rect.bottom) {
      const distance = lastY < rect.top + 60 ? -18 : lastY > rect.bottom - 60 ? 18 : 0;
      if (distance) { frame.contentWindow?.scrollBy(0, distance); position(); }
    }
    raf = requestAnimationFrame(tick);
  };
  const move = (event: PointerEvent) => {
    if (!source || event.pointerId !== pointer) return;
    // Captured events always belong to the outer shield after threshold activation.
    const fromFrame = event.view === frame.contentWindow, rect = frame.getBoundingClientRect(), scale = rect.width / frame.clientWidth;
    lastX = fromFrame ? rect.left + event.clientX * scale : event.clientX; lastY = fromFrame ? rect.top + event.clientY * scale : event.clientY;
    if (!dragging && Math.hypot(lastX - startX, lastY - startY) < 5) return;
    if (!dragging) {
      dragging = true; form.dataset.blockDragging = 'true';
      ghost = document.createElement('div'); ghost.className = 'landing-drag-ghost'; ghost.textContent = 'type' in source ? blockDefinitions[source.type].label : 'Mover bloque'; document.body.append(ghost); raf = requestAnimationFrame(tick);
    }
    event.preventDefault(); position();
  };
  const up = (event: PointerEvent) => {
    if (!source || event.pointerId !== pointer) return;
    const operation = source, destination = target, didDrag = dragging, clicked = pressed;
    event.preventDefault(); finish();
    if (didDrag && destination && editable()) commit(operation, destination);
    else if (!didDrag && editable()) clicked?.click();
    suppress = true; setTimeout(() => { suppress = false; }, 0);
  };
  const down = (event: PointerEvent) => {
    if (!editable() || event.button !== 0) return;
    const node = (event.target as Element).closest<HTMLElement>('[data-builder-type], [data-builder-move]'); if (!node) return;
    finish(); source = node.dataset.builderType ? { type: node.dataset.builderType as BlockType } : { id: node.dataset.builderMove! }; pointer = event.pointerId;
    const rect = frame.getBoundingClientRect(), scale = rect.width / frame.clientWidth, inside = node.ownerDocument === frame.contentDocument;
    startX = inside ? rect.left + event.clientX * scale : event.clientX; startY = inside ? rect.top + event.clientY * scale : event.clientY;
    // Establish one hit surface before movement starts; prevents native iframe/text drags.
    event.preventDefault(); pressed = node;
    if (node.hasPointerCapture?.(pointer)) node.releasePointerCapture(pointer);
    shield = document.createElement('div'); shield.className = 'landing-drag-shield'; document.body.append(shield);
  };
  const cancel = () => { if (dragging) notice('Movimiento cancelado.'); finish(); };
  const escape = (event: KeyboardEvent) => { if (source && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
  const click = (event: Event) => { if (suppress) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const listen = (doc: Document, add: boolean) => {
    const action = add ? 'addEventListener' : 'removeEventListener';
    doc[action]('pointerdown', down as EventListener, true); doc[action]('pointermove', move as EventListener, true); doc[action]('pointerup', up as EventListener, true); doc[action]('pointercancel', cancel, true); doc[action]('keydown', escape as EventListener, true); doc[action]('click', click, true);
  };
  const load = () => { cancel(); if (attached) listen(attached, false); attached = frame.contentDocument; if (attached) listen(attached, true); };
  listen(document, true); frame.addEventListener('load', load); load(); window.addEventListener('blur', cancel);
  return { cancel, dispose() { finish(); listen(document, false); if (attached) listen(attached, false); frame.removeEventListener('load', load); window.removeEventListener('blur', cancel); } };
}
