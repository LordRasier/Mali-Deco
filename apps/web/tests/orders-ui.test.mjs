import { test } from 'node:test';
import { execFileSync } from 'node:child_process';

test('orders UI permissions and states', () => {
  execFileSync(globalThis.process.execPath, ['tests/orders-ui.check.cjs'], { stdio: 'pipe' });
});
