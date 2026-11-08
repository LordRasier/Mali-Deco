import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('renderer-neutral cart preserves storage and asynchronous lifecycle contracts', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/cart-store.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
