import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('shared shipping browser lifecycle preserves hints and expiry boundaries', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/shipping-runtime.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
