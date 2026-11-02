import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('checkout client deduplicates bootstrap and keeps retry identity', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/checkout-ui.check.ts'], { stdio: 'pipe' });
});
