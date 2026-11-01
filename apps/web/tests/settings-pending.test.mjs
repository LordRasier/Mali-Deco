import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('store name cannot be edited while an earlier save is pending', () => {
  execFileSync(globalThis.process.execPath, ['tests/settings-pending.check.cjs'], { stdio: 'pipe' });
});
