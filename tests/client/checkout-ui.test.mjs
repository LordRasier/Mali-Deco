import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('checkout client deduplicates bootstrap and keeps retry identity', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/client/checkout-ui.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
