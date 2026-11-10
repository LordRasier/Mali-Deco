import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('admin taxonomy validates writes and refuses incomplete or failed lookup snapshots', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/client/admin-taxonomy.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
