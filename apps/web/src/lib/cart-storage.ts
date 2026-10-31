import { reconcileCart } from './cart';
import type { CartLine } from './storefront-types';

export type CartSnapshot = { lines: CartLine[]; version: string; removed: number };

/** A null result means storage is inaccessible, rather than an empty cart. */
export function readCartSnapshot(key: string): CartSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    const version = localStorage.getItem(`${key}:revision`) ?? '';
    let value: unknown;
    try { value = JSON.parse(raw ?? '[]'); } catch { value = []; }
    const result = reconcileCart(value);
    return { ...result, version: JSON.stringify([raw, version]) };
  } catch { return null; }
}

/** Call only inside the shared lock. The array format remains compatible with existing carts. */
export function writeCartSnapshot(key: string, lines: CartLine[]): CartSnapshot | null {
  try {
    localStorage.setItem(`${key}:revision`, `${Date.now()}-${Math.random()}`);
    localStorage.setItem(key, JSON.stringify(lines));
    return readCartSnapshot(key);
  } catch { return null; }
}

/** Without Web Locks the hook stays in memory, avoiding unsafe shared writes. */
export function cartLocksAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.locks;
}

/** Serialize cooperating tabs; memory-only fallback does not persist. */
export function withCartLock<T>(key: string, task: () => T): Promise<T> {
  if (cartLocksAvailable()) {
    return navigator.locks.request(`cart:${key}`, task);
  }
  return Promise.resolve().then(task);
}

export const cartChangedEvent = 'storefront-cart-changed';
