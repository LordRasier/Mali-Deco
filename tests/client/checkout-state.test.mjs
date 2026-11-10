import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('renderer-neutral checkout preserves uncertain attempts and lifecycle boundaries', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/checkout-state.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
