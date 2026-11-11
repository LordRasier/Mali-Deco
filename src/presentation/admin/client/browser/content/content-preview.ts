import { apiRequest } from '../../api';
import type { ContentTree } from './content-state';

/** Only authenticated server-rendered HTML enters this scriptless iframe. Never use user HTML or URLs. */
export function createContentPreview(host: HTMLElement, status: HTMLElement, select: (path: string, blockId?: string) => void, authorize: () => string | undefined) {
  const frame = document.createElement('iframe'); frame.title = 'Vista previa editable de la tienda';
  frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.className = 'content-preview-frame'; host.append(frame);
  let active = true, generation = 0, selected = '', enabled = true, timer: ReturnType<typeof setTimeout> | undefined;
  let pendingScroll = 0, attached: Document | undefined, renderedTarget = '';
  let openQuestions: string[] = [];
  const widths: Record<string, number> = { desktop: 1280, tablet: 768, mobile: 390 };
  const fit = () => {
    if (!host.clientWidth) return;
    const width = widths[host.dataset.viewport ?? 'desktop'] || host.clientWidth;
    const scale = Math.min(1, host.clientWidth / width);
    frame.style.transform = `translateX(-50%) scale(${scale})`;
    frame.style.width = `${width}px`; frame.style.height = `${host.clientHeight / scale}px`;
  };
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit);
  resize?.observe(host);
  const highlight = () => {
    for (const node of frame.contentDocument?.querySelectorAll<HTMLElement>('[data-editor-path]') ?? []) node.classList.toggle('editor-selected', node.dataset.editorPath === selected);
  };
  const selectedNode = () => Array.from(frame.contentDocument?.querySelectorAll<HTMLElement>('[data-editor-path]') ?? []).find(node => node.dataset.editorPath === selected);
  const click = (event: Event) => {
    // Keep native disclosure behavior, but never navigate or submit from the editor.
    if (!(event.target as Element).closest('summary')) event.preventDefault();
    const node = (event.target as Element).closest<HTMLElement>('[data-landing-id][data-editor-path]') ?? (event.target as Element).closest<HTMLElement>('[data-editor-path]');
    if (enabled && node?.dataset.editorPath) select(node.dataset.editorPath, node.dataset.landingId);
  };
  const keydown = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') click(event); };
  const detach = () => { attached?.removeEventListener('click', click, true); attached?.removeEventListener('keydown', keydown); attached = undefined; };
  const load = () => {
    detach(); if (!active) return;
    attached = frame.contentDocument ?? undefined;
    attached?.addEventListener('click', click, true); attached?.addEventListener('keydown', keydown);
    for (const node of attached?.querySelectorAll<HTMLElement>('[data-editor-path]') ?? []) node.tabIndex = 0;
    for (const button of attached?.querySelectorAll<HTMLButtonElement>('[data-cart-open]') ?? []) button.disabled = false;
    for (const detail of attached?.querySelectorAll<HTMLDetailsElement>('details') ?? []) {
      detail.open = openQuestions.includes(detail.querySelector<HTMLElement>('summary[data-editor-path]')?.dataset.editorPath ?? '');
    }
    frame.contentWindow?.scrollTo(0, pendingScroll); highlight(); fit();
  };
  frame.addEventListener('load', load);
  return {
    frame,
    select(path: string, reveal = false) { selected = path; highlight();
      if (reveal) { const node = selectedNode(), detail = node?.closest('details'); if (detail && !node?.closest('summary')) detail.open = true; node?.scrollIntoView({ block: 'nearest' }); }
    },
    enable(value: boolean) { enabled = value; },
    viewport(width: string) { host.dataset.viewport = Object.hasOwn(widths, width) ? width : 'desktop'; fit(); },
    update(settings: ContentTree, target: string) {
      const request = ++generation; clearTimeout(timer);
      host.hidden = frame.hidden = false;
      status.textContent = 'Actualizando vista previa…';
      timer = setTimeout(async () => {
        const csrf = authorize(); if (!active || !csrf) return;
        try {
          const result = await apiRequest<{ html: string }>('/admin/settings/content/editor/preview', { method: 'POST', csrf, body: { settings, target } });
          if (!active || request !== generation || !authorize()) return;
          if (typeof result.html !== 'string' || result.html.length > 2000000) throw Error('Vista previa inválida.');
          pendingScroll = renderedTarget === target ? frame.contentWindow?.scrollY ?? 0 : 0;
          openQuestions = renderedTarget === target ? Array.from(frame.contentDocument?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []).map(node => node.querySelector<HTMLElement>('summary[data-editor-path]')?.dataset.editorPath ?? '').filter(Boolean) : [];
          renderedTarget = target;
          frame.srcdoc = result.html;
          status.textContent = 'Vista previa del borrador. Seleccioná un elemento para editarlo.';
        } catch (error) { if (active && request === generation) { frame.hidden = true; status.textContent = `No se pudo actualizar la vista previa. ${error instanceof Error ? error.message : 'Revisá los campos.'}`; } }
      }, 350);
    },
    dispose() { active = false; generation++; clearTimeout(timer); resize?.disconnect(); detach(); frame.removeEventListener('load', load); frame.remove(); },
  };
}
