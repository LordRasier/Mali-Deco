'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addToCart, changeQuantity, reconcileCart, resolveCart } from '../lib/cart';
import type { CartLine, Product, StorefrontData } from '../lib/storefront-types';

const MAX_QUANTITY = 999;

type SavedCart = { key: string; lines: CartLine[] };

function readLines(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    // Unavailable storage or malformed data should not prevent shopping locally.
    return [];
  }
}

/** Stores only variant IDs and quantities; names and prices are resolved from current catalog data. */
export function useCart(products: Product[], mode: StorefrontData['mode']) {
  // Demo lines must never be silently carried into the live catalog.
  const storageKey = `storefront-cart-v1-${mode}`;
  const [saved, setSaved] = useState<SavedCart | null>(null);
  const [removedNotice, setRemovedNotice] = useState(0);

  useEffect(() => {
    const restored = reconcileCart(readLines(storageKey), products);
    setSaved({ key: storageKey, lines: restored.lines });
    setRemovedNotice(restored.removed);
  }, [storageKey, products]);

  useEffect(() => {
    if (saved?.key !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved.lines));
    } catch {
      // In-memory cart remains usable if browser storage is blocked.
    }
  }, [saved, storageKey]);

  const ready = saved?.key === storageKey;
  const lines = saved?.key === storageKey ? saved.lines : [];
  const items = useMemo(() => resolveCart(lines, products), [lines, products]);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const totals = items.reduce<Record<string, bigint>>((sums, item) => {
    sums[item.variant.currency] = (sums[item.variant.currency] ?? 0n) + BigInt(item.quantity) * BigInt(item.variant.priceMinor);
    return sums;
  }, {});

  const add = useCallback((productId: string, variantId: string) => {
    setSaved(current => {
      if (current?.key !== storageKey) return current;
      const existing = current.lines.find(line => line.productId === productId && line.variantId === variantId);
      if (existing && existing.quantity >= MAX_QUANTITY) return current;
      return { ...current, lines: addToCart(current.lines, productId, variantId) };
    });
  }, [storageKey]);

  const adjust = useCallback((productId: string, variantId: string, difference: number) => {
    setSaved(current => {
      if (current?.key !== storageKey) return current;
      const existing = current.lines.find(line => line.productId === productId && line.variantId === variantId);
      if (!existing) return current;
      const quantity = Math.min(MAX_QUANTITY, existing.quantity + difference);
      return { ...current, lines: changeQuantity(current.lines, productId, variantId, quantity) };
    });
  }, [storageKey]);

  return { ready, items, count, totals, add, adjust, removedNotice };
}
