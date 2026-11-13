import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('purchase reconciliation preserves browser carts and repeated payment returns', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/cart-purchase.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
