import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('cart presentation keeps amounts, links and shipping states honest', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/cart-ui.check.ts'], { stdio: 'pipe' });
});
