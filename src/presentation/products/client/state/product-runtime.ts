/** Browser effects are deferred until the store starts; construction is SSR-safe. */
export type ProductRuntime = {
  search(): string;
  choose(id: string): void;
  listen(callback: () => void): () => void;
};

export const browserProductRuntime: ProductRuntime = {
  search: () => window.location.search,
  choose(id) {
    const url = new URL(window.location.href);
    url.searchParams.delete('variant'); url.searchParams.set('variant', id);
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
  },
  listen(callback) {
    window.addEventListener('popstate', callback);
    return () => { window.removeEventListener('popstate', callback); };
  },
};
