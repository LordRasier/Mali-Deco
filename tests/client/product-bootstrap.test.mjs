import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('product bootstrap reuses the authoritative public detail parser', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/product-bootstrap.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
