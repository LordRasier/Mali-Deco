import { childEnvironment } from './support/test-environment.mjs';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';

test('cart template preserves accessibility and a unique shipping form', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/cart-template.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
