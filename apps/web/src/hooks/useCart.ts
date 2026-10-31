'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addToCart, changeQuantity } from '../lib/cart';
import { acceptsCartResolution, pairKey, resolveCartPairs, type ResolvedPair } from '../lib/cart-resolution';
import { cartChangedEvent, cartLocksAvailable, readCartSnapshot, withCartLock, writeCartSnapshot, type CartSnapshot } from '../lib/cart-storage';
import type { CartLine, StorefrontData } from '../lib/storefront-types';

type SavedCart = CartSnapshot & { key: string };

/** Resolve IDs independently from listings; all writes start from the latest stored cart. */
export function useCart(mode: StorefrontData['mode']) {
  const storageKey = `storefront-cart-v1-${mode}`;
  const [saved, setSaved] = useState<SavedCart | null>(null);
  const savedRef = useRef<SavedCart | null>(null);
  const modeRef = useRef(storageKey); modeRef.current = storageKey;
  const active = useRef(false);
  const memoryOnly = useRef(false);
  const revision = useRef(0);
  const [cache, setCache] = useState<{ key: string; values: Map<string, ResolvedPair> }>({ key: '', values: new Map() });
  const [removedNotice, setRemovedNotice] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);

  const adopt = useCallback((snapshot: CartSnapshot) => {
    if (!active.current || modeRef.current !== storageKey) return;
    if (savedRef.current?.key === storageKey && savedRef.current.version === snapshot.version) return;
    const next = { ...snapshot, key: storageKey };
    revision.current++; savedRef.current = next; setSaved(next);
  }, [storageKey]);

  useEffect(() => {
    active.current = true;
    const initial = readCartSnapshot(storageKey);
    memoryOnly.current = !initial || !cartLocksAvailable(); setStorageUnavailable(memoryOnly.current);
    const snapshot = initial ?? { lines: [], version: 'memory:0', removed: 0 };
    savedRef.current = null; adopt(snapshot);
    setCache({ key: storageKey, values: new Map() }); setRemovedNotice(snapshot.removed);
    const sync = () => {
      if (memoryOnly.current) return;
      const current = readCartSnapshot(storageKey);
      if (current) adopt(current);
      else { memoryOnly.current = true; setStorageUnavailable(true); }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener(cartChangedEvent, sync);
    return () => {
      active.current = false;
      window.removeEventListener('storage', sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener(cartChangedEvent, sync);
    };
  }, [storageKey, adopt]);

  const ready = saved?.key === storageKey;
  const lines = useMemo(() => ready ? saved.lines : [], [ready, saved]);
  const stateVersion = saved?.version;
  useEffect(() => {
    if (!ready || !stateVersion) return;
    const controller = new AbortController(), requestRevision = revision.current;
    const isCurrent = () => savedRef.current?.key === storageKey && acceptsCartResolution(
      { key: storageKey, revision: requestRevision },
      { key: modeRef.current, revision: revision.current, aborted: controller.signal.aborted },
    );
    if (!lines.length) { setStatus('idle'); return () => controller.abort(); }
    setStatus('loading');
    resolveCartPairs(lines, mode, controller.signal).then(async result => {
      if (!isCurrent()) return;
      const latest = memoryOnly.current ? null : readCartSnapshot(storageKey);
      if (latest && latest.version !== stateVersion) { adopt(latest); return; }
      if (!memoryOnly.current && !latest) { memoryOnly.current = true; setStorageUnavailable(true); setStatus('error'); return; }
      if (result.missing.length) {
        await withCartLock(storageKey, () => {
          if (!isCurrent()) return;
          const current = memoryOnly.current ? savedRef.current : readCartSnapshot(storageKey);
          if (!current) { setStatus('error'); return; }
          if (current.version !== stateVersion) { adopt(current); return; }
          const missing = new Set(result.missing.map(pairKey));
          const nextLines = current.lines.filter(line => !missing.has(pairKey(line)));
          const next = memoryOnly.current ? null : writeCartSnapshot(storageKey, nextLines);
          if (!next) { memoryOnly.current = true; setStorageUnavailable(true); }
          adopt(next ?? { lines: nextLines, version: `memory:${++revision.current}`, removed: 0 });
          if (next) window.dispatchEvent(new Event(cartChangedEvent));
          setRemovedNotice(count => count + result.missing.length);
        });
        return;
      }
      if (!isCurrent()) return;
      setCache({ key: storageKey, values: new Map(result.resolved.map(item => [pairKey(item), item])) });
      setStatus('idle');
    }).catch(() => { if (isCurrent()) setStatus('error'); });
    return () => controller.abort();
  }, [ready, stateVersion, mode, storageKey, retry, adopt]);

  const values = cache.key === storageKey ? cache.values : new Map<string, ResolvedPair>();
  const items = lines.map(line => ({ ...line, ...(values.get(pairKey(line)) ?? { product: null, variant: null }) }));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totals = items.reduce<Record<string, bigint>>((sums, item) => {
    if (item.variant) sums[item.variant.currency] = (sums[item.variant.currency] ?? 0n) + BigInt(item.quantity) * BigInt(item.variant.priceMinor);
    return sums;
  }, {});
  const update = useCallback((transform: (current: CartLine[]) => CartLine[]) => {
    void withCartLock(storageKey, () => {
      if (!active.current || savedRef.current?.key !== storageKey || modeRef.current !== storageKey) return;
      let current = memoryOnly.current ? savedRef.current : readCartSnapshot(storageKey);
      if (!current) { memoryOnly.current = true; setStorageUnavailable(true); current = savedRef.current; }
      const nextLines = transform(current.lines);
      const next = memoryOnly.current ? null : writeCartSnapshot(storageKey, nextLines);
      if (!next) { memoryOnly.current = true; setStorageUnavailable(true); }
      adopt(next ?? { lines: nextLines, version: `memory:${++revision.current}`, removed: 0 });
      if (next) window.dispatchEvent(new Event(cartChangedEvent));
    }).catch(() => { if (active.current) setStatus('error'); });
  }, [storageKey, adopt]);
  const add = useCallback((productId: string, variantId: string) => update(current => {
    const existing = current.find(line => line.productId === productId && line.variantId === variantId);
    if ((existing && existing.quantity >= 999) || (!existing && current.length >= 1000)) return current;
    return addToCart(current, productId, variantId);
  }), [update]);
  const adjust = useCallback((productId: string, variantId: string, difference: number) => update(current => {
    const existing = current.find(line => line.productId === productId && line.variantId === variantId);
    return existing ? changeQuantity(current, productId, variantId, Math.min(999, existing.quantity + difference)) : current;
  }), [update]);
  return { ready, items, count, totals, add, adjust, removedNotice, status, storageUnavailable, retry: () => setRetry(n => n + 1), unresolved: items.some(item => !item.product || !item.variant) || status !== 'idle' };
}
