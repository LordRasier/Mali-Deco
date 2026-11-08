/** BFCache keeps memory alive: discard section DOM on suspension and recheck identity before restoration. */
export function installAdminLifecycle(events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  mount: () => { dispose(): void }, revalidate: () => void) {
  let live = true, mounted: ReturnType<typeof mount> | undefined = mount();
  const suspend = () => { mounted?.dispose(); mounted = undefined; };
  const resume = (event: Event) => {
    if (!live || mounted) return;
    if ('persisted' in event && event.persisted) revalidate();
    mounted = mount();
  };
  events.addEventListener('pagehide', suspend); events.addEventListener('pageshow', resume);
  return () => {
    if (!live) return;
    live = false; events.removeEventListener('pagehide', suspend); events.removeEventListener('pageshow', resume); suspend();
  };
}
