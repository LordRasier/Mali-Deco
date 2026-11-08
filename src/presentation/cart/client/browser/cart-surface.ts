/** Move, never clone: the page and modal share form values, focus targets and one shipping session. */
export function mountCartSurface(dialog: HTMLDialogElement, content: HTMLElement, slot: HTMLElement | null) {
  let locked = false;
  // Native close events are queued; an earlier event must not empty a reopened modal.
  const restore = () => { if (slot && !dialog.open && content.parentElement !== slot) slot.append(content); };
  dialog.addEventListener('close', restore); restore();
  return {
    open() { if (!locked && !dialog.open) { dialog.append(content); dialog.showModal(); } },
    close() { dialog.close(); restore(); },
    setLocked(value: boolean) { locked = value; if (locked && dialog.open) { dialog.close(); restore(); } },
    isLocked: () => locked,
    visible: () => !!slot || dialog.open,
    dispose() { dialog.removeEventListener('close', restore); },
  };
}
