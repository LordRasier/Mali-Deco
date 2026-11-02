import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('checkout summary shows only a valid same-currency total', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/checkout-ui-summary.check.ts'], { stdio: 'pipe' });
});
