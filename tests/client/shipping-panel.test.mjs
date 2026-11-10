import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('MVC shipping presentation never combines stale or incompatible estimates', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/shipping-panel.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
