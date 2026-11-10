import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('MVC checkout binds stable native controls to the shared lifecycle owner', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/checkout-browser.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
