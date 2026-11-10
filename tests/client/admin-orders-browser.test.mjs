import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('MVC order reads reject stale results and keep identity boundaries', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/admin-orders-browser.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
