import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('cart page and modal preserve one shared form and store surface', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/cart-surface.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
