/* global module, setImmediate */
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

// Controlled hook lifecycle for source-level probes. This is not a browser renderer.
function hookRunner(React, renderHook) {
  const shared = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!shared || !('H' in shared)) throw new Error('Unexpected locked React dispatcher shape');
  const slots = [];
  let cursor = 0;
  let pending = [];
  let dirty = true;
  const runner = { output: undefined };
  const memo = (factory, dependencies) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].dependencies, dependencies)) slots[index] = { value: factory(), dependencies: dependencies?.slice() };
    return slots[index].value;
  };
  const dispatcher = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = update => {
          const next = typeof update === 'function' ? update(slot.value) : update;
          if (!Object.is(next, slot.value)) { slot.value = next; dirty = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const slot = slots[index];
      if (!slot || !same(slot.dependencies, dependencies)) pending.push({ index, effect, dependencies: dependencies?.slice() });
    },
    useMemo: memo,
    useCallback: (callback, dependencies) => memo(() => callback, dependencies),
    useSyncExternalStore(subscribe, getSnapshot) { void subscribe; return getSnapshot(); },
  };
  runner.flush = () => {
    let cycles = 0;
    do {
      dirty = false;
      cursor = 0;
      const previous = shared.H;
      shared.H = dispatcher;
      try { runner.output = renderHook(); } finally { shared.H = previous; }
      const queue = pending;
      pending = [];
      for (const { index, effect, dependencies } of queue) {
        slots[index]?.cleanup?.();
        slots[index] = { dependencies, cleanup: effect() };
      }
      if (++cycles > 50) throw new Error('Probe failed to settle synchronous hook updates');
    } while (dirty);
    return runner.output;
  };
  runner.settle = async (rounds = 10) => {
    for (let index = 0; index < rounds; index++) { runner.flush(); await new Promise(setImmediate); }
    return runner.flush();
  };
  runner.unmount = () => { for (const slot of slots) slot?.cleanup?.(); };
  return runner;
}
module.exports = { hookRunner };
