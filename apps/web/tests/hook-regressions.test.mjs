import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('product pages and shared carts keep state consistent', () => {
  execFileSync(globalThis.process.execPath, ['tests/hook-regressions.check.cjs'], { stdio: 'pipe' });
});
