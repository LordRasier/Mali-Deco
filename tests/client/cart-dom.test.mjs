import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('native cart rendering and browser event bindings preserve presentation contracts', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/cart-dom.check.ts', 'tests/client/cart-chrome.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
