import assert from 'node:assert/strict';
import test from 'node:test';
import { installAdminLifecycle } from '../../src/presentation/admin/client/browser/admin-lifecycle';

test('page restoration revalidates once before remounting and cleanup prevents queued events', () => {
  const events = new EventTarget(), calls: string[] = [];
  const dispose = installAdminLifecycle(events, () => { calls.push('mount'); return { dispose: () => { calls.push('dispose'); } }; }, () => { calls.push('revalidate'); });
  events.dispatchEvent(new Event('pageshow')); assert.deepEqual(calls, ['mount']);
  events.dispatchEvent(new Event('pagehide'));
  const restored = new Event('pageshow'); Object.defineProperty(restored, 'persisted', { value: true });
  events.dispatchEvent(restored); events.dispatchEvent(restored);
  assert.deepEqual(calls, ['mount', 'dispose', 'revalidate', 'mount']);
  dispose(); events.dispatchEvent(restored); assert.deepEqual(calls, ['mount', 'dispose', 'revalidate', 'mount', 'dispose']);
});
