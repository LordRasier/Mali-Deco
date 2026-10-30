import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('product and variant validation matches backend input constraints', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/admin-form-validation.check.ts'], { stdio: 'pipe' });
});
