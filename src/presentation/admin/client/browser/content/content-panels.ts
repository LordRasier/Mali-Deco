/** Standard keyboard tabs in one collapsible inspector; no duplicate sidebars. */
export function mountContentPanels(form: HTMLElement) {
  const tabs = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-content-tab]'));
  const panels = Array.from(form.querySelectorAll<HTMLElement>('[data-content-panel]'));
  const toggle = form.querySelector<HTMLButtonElement>('[data-content-toggle]');
  const close = form.querySelector<HTMLButtonElement>('[data-content-close]');
  const setHidden = (hidden: boolean) => {
    form.dataset.panelHidden = String(hidden);
    toggle?.setAttribute('aria-expanded', String(!hidden));
    if (toggle) toggle.textContent = hidden ? 'Mostrar panel' : 'Ocultar panel';
  };
  const show = (id: string) => {
    for (const tab of tabs) { const active = tab.dataset.contentTab === id; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; }
    for (const panel of panels) panel.hidden = panel.dataset.contentPanel !== id;
  };
  const click = () => setHidden(form.dataset.panelHidden !== 'true');
  const hide = () => { setHidden(true); toggle?.focus(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && form.dataset.panelHidden !== 'true') { event.preventDefault(); hide(); } };
  const listeners = tabs.map((tab, index) => {
    const select = () => show(tab.dataset.contentTab!);
    const key = (event: KeyboardEvent) => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
      if (next < 0) return; event.preventDefault(); show(tabs[next].dataset.contentTab!); tabs[next].focus();
    };
    tab.addEventListener('click', select); tab.addEventListener('keydown', key); return { tab, select, key };
  });
  toggle?.addEventListener('click', click); close?.addEventListener('click', hide); form.addEventListener('keydown', escape);
  setHidden(window.matchMedia?.('(max-width: 650px)').matches ?? false);
  return { show, inspect() { setHidden(false); show('properties'); }, dispose() {
    toggle?.removeEventListener('click', click);
    close?.removeEventListener('click', hide); form.removeEventListener('keydown', escape);
    for (const { tab, select, key } of listeners) { tab.removeEventListener('click', select); tab.removeEventListener('keydown', key); }
  } };
}
