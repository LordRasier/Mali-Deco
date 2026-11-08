import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('product route selection and HTTP behavior', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/client/product-detail.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
