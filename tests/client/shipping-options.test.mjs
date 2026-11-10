import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('shipping option controls preserve provider selection, disclosures and focus', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/shipping-options.check.ts'], {stdio: 'pipe', env: childEnvironment()});
});
