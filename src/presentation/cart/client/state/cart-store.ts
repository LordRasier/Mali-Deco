import { addToCart, changeQuantity } from '../../../shared/cart/cart';
import { pairKey, resolveCartPairs, type ResolvedPair } from '../../../shared/cart/cart-resolution';
import type { CartSnapshot, CartStorageArea } from '../../../shared/cart/cart-storage';
import type { CartLine, StorefrontData } from '../../../shared/catalog/storefront-types';
import { browserCartRuntime, type CartRuntime } from './cart-runtime';
import { cartSnapshot, type CartFlags } from './cart-snapshot';
import { variantLimit } from '../../../shared/cart/inventory';

type Options = { runtime?: CartRuntime; resolve?: typeof resolveCartPairs };

/** Renderer-neutral state. One owner per mounted view; storage coordinates other views. */
export function createCartStore(mode: StorefrontData['mode'], options: Options = {}) {
  const runtime = options.runtime ?? browserCartRuntime, resolve = options.resolve ?? resolveCartPairs;
  const key = `storefront-cart-v1-${mode}`, listeners = new Set<() => void>();
  let saved: CartSnapshot | null = null, cache = new Map<string, ResolvedPair>();
  let active = false, memoryOnly = false, generation = 0, revision = 0;
  let mutations = 0;
  let area: CartStorageArea = 'local', request: AbortController | undefined, unlisten: (() => void) | undefined;
  let flags: CartFlags = { ready: false, status: 'idle', removedNotice: 0, storageUnavailable: false, storageTabOnly: false };
  const serverSnapshot = cartSnapshot([], cache, flags);
  let snapshot = serverSnapshot;
  const publish = () => {
    snapshot = cartSnapshot(saved?.lines ?? [], cache, flags);
    for (const listener of listeners) listener();
  };
  const beginMutation = () => { mutations++; flags.mutating = true; publish(); };
  const endMutation = (lifecycle: number) => { if (active && generation === lifecycle) { mutations--; flags.mutating = mutations > 0; publish(); } };
  const loseStorage = () => {
    memoryOnly = true;
    flags = { ...flags, storageUnavailable: true, storageTabOnly: false };
  };
  const adopt = (next: CartSnapshot) => {
    if (!active || saved?.version === next.version) return;
    revision++; saved = next;
    refresh();
  };
  const persist = (lines: CartLine[]) => {
    const next = memoryOnly ? null : runtime.write(key, lines, area);
    if (!next) loseStorage();
    adopt(next ?? { lines, version: `memory:${++revision}`, removed: 0 });
    if (next) runtime.notify();
  };
  const sync = () => {
    if (!active || memoryOnly) return;
    const next = runtime.read(key, area);
    if (next) adopt(next);
    else { loseStorage(); publish(); }
  };

  function refresh() {
    request?.abort();
    if (!active || !saved) return;
    const controller = new AbortController(); request = controller;
    const lifecycle = generation, identity = revision, version = saved.version, lines = saved.lines;
    const current = () => active && lifecycle === generation && identity === revision && !controller.signal.aborted;
    if (!saved.lines.length) { flags.status = 'idle'; publish(); return; }
    flags.status = 'loading'; publish();
    // Subscribers may stop/restart the owner synchronously during publication.
    if (!current()) return;
    // A resolver may throw synchronously as well as reject asynchronously.
    void (async () => {
      try {
        const result = await resolve(lines, mode, controller.signal);
        if (!current()) return;
        const latest = memoryOnly ? null : runtime.read(key, area);
        if (latest && latest.version !== version) { adopt(latest); return; }
        if (!memoryOnly && !latest) { loseStorage(); flags.status = 'error'; publish(); return; }
        if (result.missing.length) {
          await runtime.lock(key, () => {
            if (!current()) return;
            const stored = memoryOnly ? saved : runtime.read(key, area);
            if (!stored) { loseStorage(); flags.status = 'error'; publish(); return; }
            if (stored.version !== version) { adopt(stored); return; }
            const missing = new Set(result.missing.map(pairKey));
            flags.removedNotice += result.missing.length;
            persist(stored.lines.filter(line => !missing.has(pairKey(line))));
          });
          return;
        }
        if (!current()) return;
        cache = new Map(result.resolved.map(item => [pairKey(item), item]));
        flags.status = 'idle'; publish();
      } catch {
        if (current()) { flags.status = 'error'; publish(); }
      }
    })();
  }

  const update = async (transform: (lines: CartLine[]) => CartLine[] | Promise<CartLine[]>) => {
    const lifecycle = generation;
    if (!active || !saved) return;
    beginMutation();
    try {
      await runtime.lock(key, async () => {
        if (!active || lifecycle !== generation || !saved) return;
        let current = memoryOnly ? saved : runtime.read(key, area);
        if (!current) { loseStorage(); current = saved; }
        const next = await transform(current.lines);
        if (!active || lifecycle !== generation) return;
        flags.mutationError = ''; persist(next);
      });
    } catch (error) {
      if (active && lifecycle === generation) { flags.mutationError = error instanceof Error ? error.message : 'No se pudo actualizar el carrito.'; publish(); }
    } finally { endMutation(lifecycle); }
  };

  async function verifyIncrease(lines: CartLine[], productId: string, variantId: string, difference: number, signal?: AbortSignal) {
    const result = await resolve([{ productId, variantId }], mode, signal);
    const receipt = result.resolved.find(item => item.productId === productId && item.variantId === variantId);
    if (!receipt || result.missing.length) throw new Error('Esta opción ya no está disponible. Elegí otra opción.');
    const quantity = (lines.find(line => line.productId === productId && line.variantId === variantId)?.quantity ?? 0) + difference;
    if (quantity > variantLimit(receipt.variant)) throw new Error('La cantidad supera el stock disponible o el límite de unidades de esta opción.');
    return receipt;
  }

  function start() {
    if (active) throw new Error('Cart store already started');
    active = true;
    mutations = 0;
    const lifecycle = ++generation;
    // BFCache/StrictMode may resume this owner: storage failure must not erase retained memory.
    const retained = memoryOnly ? saved : null;
    const shared = retained ? null : runtime.read(key, 'local'), hasTab = retained ? false : runtime.has(key, 'session');
    const useTab = hasTab === true || !runtime.locksAvailable() || !shared;
    area = useTab ? 'session' : 'local';
    const initial = retained ? null : useTab
      ? hasTab ? runtime.read(key, 'session') : runtime.write(key, shared?.lines ?? [], 'session')
      : shared;
    memoryOnly = !initial;
    const next = retained ?? initial ?? shared ?? { lines: [], version: 'memory:0', removed: 0 };
    flags = { ready: true, status: 'idle', removedNotice: next.removed, storageUnavailable: useTab || memoryOnly, storageTabOnly: useTab && !memoryOnly };
    saved = null; cache = new Map();
    unlisten = runtime.listen(sync);
    adopt(next);
    return () => {
      if (!active || lifecycle !== generation) return;
      active = false; generation++; request?.abort(); unlisten?.(); unlisten = undefined;
    };
  }

  return {
    start, getSnapshot: () => snapshot, getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Catalog actions verify availability before persistence and never hide failures from their caller. */
    async addVerified(productId: string, variantId: string, signal?: AbortSignal) {
      const lifecycle = generation;
      const check = () => {
        signal?.throwIfAborted();
        if (!active || lifecycle !== generation || !saved) throw new Error('El carrito no está disponible. Volvé a intentarlo.');
      };
      check();
      let receipt!: ResolvedPair;
      beginMutation();
      try {
        await runtime.lock(key, async () => {
          check();
          const stored = memoryOnly ? saved! : runtime.read(key, area);
          if (!stored) loseStorage();
          const lines = (stored ?? saved!).lines;
          const existing = lines.find(line => line.productId === productId && line.variantId === variantId);
          if (existing && existing.quantity >= 999) throw new Error('Alcanzaste el límite de unidades de esta opción.');
          if (!existing && lines.length >= 1000) throw new Error('El carrito alcanzó su límite de productos.');
          receipt = await verifyIncrease(lines, productId, variantId, 1, signal); check(); flags.mutationError = '';
          cache.set(pairKey(receipt), receipt);
          persist(addToCart(lines, productId, variantId));
        });
        return receipt;
      } finally { endMutation(lifecycle); }
    },
    add: (productId: string, variantId: string) => update(async lines => {
      const existing = lines.find(line => line.productId === productId && line.variantId === variantId);
      if ((existing && existing.quantity >= 999) || (!existing && lines.length >= 1000)) return lines;
      await verifyIncrease(lines, productId, variantId, 1); return addToCart(lines, productId, variantId);
    }),
    adjust: (productId: string, variantId: string, difference: number) => update(async lines => {
      const existing = lines.find(line => line.productId === productId && line.variantId === variantId);
      if (!Number.isSafeInteger(difference)) throw new Error('Cantidad inválida.');
      if (existing && difference > 0) await verifyIncrease(lines, productId, variantId, difference);
      return existing ? changeQuantity(lines, productId, variantId, Math.min(999, existing.quantity + difference)) : lines;
    }),
    remove: (productId: string, variantId: string) => update(lines => lines.filter(line => line.productId !== productId || line.variantId !== variantId)),
    retry: () => { if (active) refresh(); },
  };
}
