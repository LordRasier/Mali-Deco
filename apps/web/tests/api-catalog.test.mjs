import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('catalog query, API, demo filtering and independent cart resolution', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/catalog.check.ts'], { stdio: 'pipe' });
});
