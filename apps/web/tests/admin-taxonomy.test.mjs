import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('admin taxonomy validates writes and refuses incomplete or failed lookup snapshots', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/admin-taxonomy.check.ts'], { stdio: 'pipe' });
});
