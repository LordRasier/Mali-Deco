'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProductDetail } from '../lib/api-catalog';
import { demoCatalog } from '../lib/demo-catalog';
import { initialDetailSelection } from '../lib/detail-selection';
import type { Product, StorefrontData } from '../lib/storefront-types';

type DetailState = { product: Product; preferredId: string; page: number; total: number; loading: boolean; error: string | null; warning: string | null };
export function useProductDetail(mode: StorefrontData['mode']) {
  const [state, setState] = useState<DetailState | null>(null);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);
  const close = useCallback(() => { current.current?.abort(); setState(null); }, []);
  const load = useCallback(async (summary: Product, page: number, preferredId: string, previous?: DetailState) => {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    setState({ product: previous?.product ?? summary, preferredId, page: previous?.page ?? 0, total: previous?.total ?? 0, loading: true, error: null, warning: previous?.warning ?? null });
    try {
      const detail = await fetchProductDetail('/api/v1/', summary.slug, page, controller.signal);
      if (controller.signal.aborted) return;
      if (detail.product.id !== summary.id || detail.product.slug !== summary.slug || (previous && detail.total !== previous.total)) throw new Error('El producto cambió durante la carga.');
      const selection = page === 1 ? await initialDetailSelection(summary, detail.product.variants, controller.signal) : null;
      if (controller.signal.aborted) return;
      const byId = new Map((selection?.variants ?? previous?.product.variants ?? []).map(v => [v.id, v]));
      for (const variant of detail.product.variants) byId.set(variant.id, variant);
      setState({ product: { ...detail.product, image: summary.image, variants: [...byId.values()] }, preferredId: selection ? selection.preferredId : preferredId, warning: selection ? selection.warning : previous?.warning ?? null, page, total: detail.total, loading: false, error: null });
    } catch {
      if (!controller.signal.aborted) setState(s => s ? { ...s, loading: false, error: 'No pudimos cargar las variantes. Intentá nuevamente.' } : s);
    }
  }, []);
  const open = useCallback((summary: Product) => {
    const preferredId = summary.variants[0]?.id ?? '';
    if (mode === 'demo') {
      const product = demoCatalog.products.find(p => p.id === summary.id);
      if (product) setState({ product, preferredId, page: 1, total: product.variants.length, loading: false, error: null, warning: null });
    } else void load(summary, 1, preferredId);
  }, [mode, load]);
  const next = useCallback(() => { if (state && !state.loading) void load(state.product, state.page + 1, state.preferredId, state); }, [state, load]);
  const retry = useCallback(() => { if (state) void load(state.product, state.page ? state.page + 1 : 1, state.preferredId, state.page ? state : undefined); }, [state, load]);
  return { state, open, close, next, retry, hasMore: !!state && mode === 'api' && state.page * 100 < state.total };
}
