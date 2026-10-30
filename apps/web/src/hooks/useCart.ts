'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addToCart, changeQuantity, reconcileCart } from '../lib/cart';
import { acceptsCartResolution, pairKey, resolveCartPairs, type ResolvedPair } from '../lib/cart-resolution';
import type { CartLine, StorefrontData } from '../lib/storefront-types';

type SavedCart = { key: string; lines: CartLine[] };
const signature = (lines: CartLine[]) => JSON.stringify(lines.map(({ productId, variantId }) => [productId, variantId]));
function readLines(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function writeLines(key: string, lines: CartLine[]) {
  try { localStorage.setItem(key, JSON.stringify(lines)); } catch { /* In-memory cart remains usable. */ }
}
/** Resolve IDs independently from the current listing; failures retain all stored lines. */
export function useCart(mode: StorefrontData['mode']) {
  const storageKey = `storefront-cart-v1-${mode}`;
  const [saved, setSaved] = useState<SavedCart | null>(null);
  const savedRef = useRef<SavedCart | null>(null);
  const modeRef = useRef(storageKey); modeRef.current = storageKey;
  const revision = useRef(0);
  const [cache, setCache] = useState<{ key: string; values: Map<string, ResolvedPair> }>({ key: '', values: new Map() });
  const [removedNotice, setRemovedNotice] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const restored = reconcileCart(readLines(storageKey));
    const next = { key: storageKey, lines: restored.lines };
    revision.current++; savedRef.current = next; setSaved(next);
    setCache({ key: storageKey, values: new Map() }); setRemovedNotice(restored.removed);
    writeLines(storageKey, restored.lines);
  }, [storageKey]);
  const ready = saved?.key === storageKey;
  const lines = useMemo(() => ready ? saved.lines : [], [ready, saved]);
  const pairsSignature = signature(lines);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController(), requestRevision = revision.current;
    const isCurrent = () => savedRef.current?.key === storageKey && acceptsCartResolution({ key: storageKey, revision: requestRevision }, { key: modeRef.current, revision: revision.current, aborted: controller.signal.aborted });
    if (!lines.length) { setStatus('idle'); return () => controller.abort(); }
    setStatus('loading');
    resolveCartPairs(lines, mode, controller.signal).then(result => {
      if (!isCurrent()) return;
      setCache({ key: storageKey, values: new Map(result.resolved.map(item => [pairKey(item), item])) });
      setStatus('idle');
      if (result.missing.length && savedRef.current) {
        const missing = new Set(result.missing.map(pairKey));
        const next = { ...savedRef.current, lines: savedRef.current.lines.filter(line => !missing.has(pairKey(line))) };
        revision.current++; savedRef.current = next; setSaved(next); writeLines(storageKey, next.lines);
        setRemovedNotice(count => count + result.missing.length);
      }
    }).catch(() => { if (isCurrent()) setStatus('error'); });
    return () => controller.abort();
    // Pair identity, not quantity, drives authoritative lookup.
  }, [ready, pairsSignature, mode, storageKey, retry]);
  const values = cache.key === storageKey ? cache.values : new Map<string, ResolvedPair>();
  const items = lines.map(line => ({ ...line, ...(values.get(pairKey(line)) ?? { product: null, variant: null }) }));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totals = items.reduce<Record<string, bigint>>((sums, item) => {
    if (item.variant) sums[item.variant.currency] = (sums[item.variant.currency] ?? 0n) + BigInt(item.quantity) * BigInt(item.variant.priceMinor);
    return sums;
  }, {});
  const update = useCallback((transform: (lines: CartLine[]) => CartLine[]) => {
    const current = savedRef.current;
    if (current?.key !== storageKey || modeRef.current !== storageKey) return;
    const next = { ...current, lines: transform(current.lines) };
    if (signature(current.lines) !== signature(next.lines)) revision.current++;
    savedRef.current = next; setSaved(next); writeLines(storageKey, next.lines);
  }, [storageKey]);
  const add = useCallback((productId: string, variantId: string) => update(current => {
    const existing = current.find(line => line.productId === productId && line.variantId === variantId);
    if ((existing && existing.quantity >= 999) || (!existing && current.length >= 1000)) return current;
    return addToCart(current, productId, variantId);
  }), [update]);
  const adjust = useCallback((productId: string, variantId: string, difference: number) => update(current => {
    const existing = current.find(line => line.productId === productId && line.variantId === variantId);
    return existing ? changeQuantity(current, productId, variantId, Math.min(999, existing.quantity + difference)) : current;
  }), [update]);
  return { ready, items, count, totals, add, adjust, removedNotice, status, retry: () => setRetry(n => n + 1), unresolved: items.some(item => !item.product || !item.variant) || status !== 'idle' };
}
