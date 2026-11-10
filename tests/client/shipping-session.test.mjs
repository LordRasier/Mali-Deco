import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('shipping state is shared, invalidated and never guesses a postal destination', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/client/shipping-session.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
