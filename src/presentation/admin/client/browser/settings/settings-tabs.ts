/** Hide panels without replacing their controls, so drafts and file selections survive tab changes. */
export function mountSettingsTabs(root: HTMLElement) {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-settings-panel]'));
  const form = root.querySelector<HTMLFormElement>('[data-settings-form]');
  function select(id: string, focus = false) {
    const selected = buttons.find(button => button.dataset.settingsTab === id);
    if (!selected) return;
    for (const button of buttons) {
      const active = button === selected;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.settingsPanel !== id;
    if (form) form.hidden = id !== 'identity' && id !== 'social';
    if (focus) selected.focus();
  }
  const listeners = buttons.map((button, index) => {
    const click = () => select(button.dataset.settingsTab!);
    const keydown = (event: KeyboardEvent) => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % buttons.length
          : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length : -1;
      if (next < 0) return;
      event.preventDefault(); select(buttons[next].dataset.settingsTab!, true);
    };
    button.addEventListener('click', click); button.addEventListener('keydown', keydown);
    return { button, click, keydown };
  });
  select((buttons.find(button => button.getAttribute('aria-selected') === 'true') ?? buttons[0])?.dataset.settingsTab ?? 'identity');
  return { select, dispose() { for (const { button, click, keydown } of listeners) { button.removeEventListener('click', click); button.removeEventListener('keydown', keydown); } } };
}
