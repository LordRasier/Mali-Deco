import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('renderer-neutral product state preserves selection, pagination and lifecycle contracts', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/product-state.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
