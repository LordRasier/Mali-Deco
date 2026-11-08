import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('MVC admin preserves authentication, navigation, retained views and lifecycle boundaries', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test',
    'tests/client/admin-browser.check.ts', 'tests/client/admin-runtime.check.ts', 'tests/client/admin-dom.check.ts', 'tests/client/admin-lifecycle.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
