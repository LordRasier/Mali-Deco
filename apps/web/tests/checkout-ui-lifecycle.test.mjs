import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('checkout lifecycle retains uncertain attempts across reload and ignores stale quotes', () => {
  execFileSync(globalThis.process.execPath, ['tests/checkout-ui-lifecycle.check.cjs'], { stdio: 'pipe' });
});
