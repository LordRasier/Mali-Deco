import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('MVC header preserves disclosure and focus behavior', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/site-header.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
