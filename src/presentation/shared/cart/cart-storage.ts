import { reconcileCart } from './cart';
import type { CartLine } from '../catalog/storefront-types';

export type CartSnapshot = { lines: CartLine[]; version: string; removed: number };
export type CartStorageArea = 'local' | 'session';
const areaStorage = (area: CartStorageArea) => area === 'session' ? sessionStorage : localStorage;

/** Distinguish a new tab from a saved empty cart. */
export function hasCartSnapshot(key: string, area: CartStorageArea): boolean | null {
  try { return areaStorage(area).getItem(key) !== null; } catch { return null; }
}

/** A null result means storage is inaccessible, rather than an empty cart. */
export function readCartSnapshot(key: string, area: CartStorageArea = 'local'): CartSnapshot | null {
  try {
    const raw = areaStorage(area).getItem(key);
    const version = areaStorage(area).getItem(`${key}:revision`) ?? '';
    let value: unknown;
    try { value = JSON.parse(raw ?? '[]'); } catch { value = []; }
    const result = reconcileCart(value);
    return { ...result, version: JSON.stringify([raw, version]) };
  } catch { return null; }
}

/** Call only inside the shared lock. The array format remains compatible with existing carts. */
export function writeCartSnapshot(key: string, lines: CartLine[], area: CartStorageArea = 'local'): CartSnapshot | null {
  try {
    areaStorage(area).setItem(`${key}:revision`, `${Date.now()}-${Math.random()}`);
    areaStorage(area).setItem(key, JSON.stringify(lines));
    return readCartSnapshot(key, area);
  } catch { return null; }
}

/** Web Locks protect shared local storage; session storage is scoped to one tab. */
export function cartLocksAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.locks;
}

/** Serialize shared writes; the session fallback is isolated to this tab. */
const localQueues = new Map<string, Promise<void>>();
export async function withCartLock<T>(key: string, task: () => T | Promise<T>): Promise<T> {
  if (cartLocksAvailable()) {
    return await navigator.locks.request(`cart:${key}`, task);
  }
  const next = (localQueues.get(key) ?? Promise.resolve()).then(task);
  const settled = next.then(() => {}, () => {});
  localQueues.set(key, settled);
  void settled.then(() => { if (localQueues.get(key) === settled) localQueues.delete(key); });
  return next;
}

export const cartChangedEvent = 'storefront-cart-changed';
