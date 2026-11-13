import {
  cartChangedEvent, cartLocksAvailable, hasCartSnapshot, readCartSnapshot, completeCartPurchase,
  withCartLock, writeCartSnapshot, type CartSnapshot, type CartStorageArea,
} from '../../../shared/cart/cart-storage';
import type { CartLine } from '../../../shared/catalog/storefront-types';

/** Browser effects only; constructing a store must not access browser globals. */
export type CartRuntime = {
  read(key: string, area: CartStorageArea): CartSnapshot | null;
  has(key: string, area: CartStorageArea): boolean | null;
  write(key: string, lines: CartLine[], area: CartStorageArea): CartSnapshot | null;
  completePurchase?(key: string, orderId: string, purchased: CartLine[], area: CartStorageArea): CartSnapshot | null;
  locksAvailable(): boolean;
  lock(key: string, task: () => void): Promise<void>;
  listen(callback: () => void): () => void;
  notify(): void;
};

export const browserCartRuntime: CartRuntime = {
  read: readCartSnapshot, has: hasCartSnapshot, write: writeCartSnapshot, completePurchase: completeCartPurchase,
  locksAvailable: cartLocksAvailable, lock: withCartLock,
  listen(callback) {
    const events = ['storage', 'pageshow', cartChangedEvent];
    for (const event of events) window.addEventListener(event, callback);
    return () => { for (const event of events) window.removeEventListener(event, callback); };
  },
  notify: () => { window.dispatchEvent(new Event(cartChangedEvent)); },
};
