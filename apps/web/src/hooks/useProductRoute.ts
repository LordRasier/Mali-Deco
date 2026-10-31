'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProductDetail } from '../lib/api-catalog';
import { parseVariantQuery, resolveRequestedVariant } from '../lib/product-selection';
import type { Product, Variant } from '../lib/storefront-types';

export function useProductRoute(initial: Product, total: number, mode: 'demo' | 'api') {
  const [variants, setVariants] = useState(initial.variants);
  const variantsRef = useRef(initial.variants);
  const [selected, setSelected] = useState<Variant | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [warning, setWarning] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const read = () => { controller.current?.abort(); moreController.current?.abort(); setLoadingMore(false); request.current++; setSelected(null); setStatus('loading'); setRevision(value => value + 1); };
    window.addEventListener('popstate', read);
    return () => { window.removeEventListener('popstate', read); controller.current?.abort(); moreController.current?.abort(); };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    const identity = ++request.current;
    setSelected(null); setWarning(null); setStatus('loading');
    const query = parseVariantQuery(new URLSearchParams(window.location.search));
    resolveRequestedVariant(initial.id, variantsRef.current, query, mode, current.signal).then(result => {
      if (current.signal.aborted || request.current !== identity) return;
      setSelected(result.variant); setWarning(result.warning); setStatus('ready');
    }).catch(() => {
      if (!current.signal.aborted && request.current === identity) { setSelected(null); setStatus('error'); }
    });
    return () => current.abort();
  }, [initial.id, mode, revision]);

  const choose = useCallback((id: string) => {
    controller.current?.abort(); moreController.current?.abort(); setLoadingMore(false); request.current++;
    setSelected(null); setStatus('loading');
    const url = new URL(window.location.href);
    url.searchParams.delete('variant'); url.searchParams.set('variant', id);
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
    setRevision(value => value + 1);
  }, []);
  const loadMore = useCallback(async () => {
    if (loadingMore || mode !== 'api') return;
    const current = new AbortController(); moreController.current?.abort(); moreController.current = current;
    setLoadingMore(true); setPageError(false);
    try {
      const response = await fetchProductDetail('/api/v1/', initial.slug, page + 1, current.signal);
      if (current.signal.aborted) return;
      if (response.product.id !== initial.id || response.total !== total) throw new Error('El producto cambió');
      const combined = new Map(variantsRef.current.map(item => [item.id, item]));
      response.product.variants.forEach(item => combined.set(item.id, item));
      variantsRef.current = [...combined.values()]; setVariants(variantsRef.current); setPage(page + 1);
      setSelected(item => item ? combined.get(item.id) ?? item : null);
    } catch { if (!current.signal.aborted) setPageError(true); }
    finally { if (!current.signal.aborted) setLoadingMore(false); }
  }, [initial.id, initial.slug, loadingMore, mode, page, total]);
  return { variants, selected, status, warning, choose, retry: () => setRevision(value => value + 1),
    hasMore: mode === 'api' && page * 100 < total, loadingMore, pageError, loadMore };
}
