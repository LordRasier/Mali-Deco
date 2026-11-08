import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAdminFeature, registerAdminFeature } from '../../src/presentation/admin/client/browser/admin-features';

test('feature registry mounts one explicit owner and returns its cleanup without remounting on navigation', () => {
  const root = {} as HTMLElement, session = {} as never; let mounted = 0, disposed = 0;
  const mount = (element: HTMLElement, owner: unknown) => { assert.equal(element, root); assert.equal(owner, session); mounted++; return () => { disposed++; }; };
  const unregister = registerAdminFeature('products', mount);
  assert.throws(() => registerAdminFeature('products', () => () => {}), /registered/);
  const stop = mountAdminFeature('products', root, session); assert.equal(mounted, 1); stop(); assert.equal(disposed, 1);
  unregister(); mountAdminFeature('products', root, session)(); assert.equal(mounted, 1);
});
