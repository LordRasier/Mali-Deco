import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('MVC settings preserve drafts, validation and uncertain-write recovery', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/admin-settings.check.ts', 'tests/client/admin-settings-tabs.check.ts', 'tests/client/admin-brand.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
