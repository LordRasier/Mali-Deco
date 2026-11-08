import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('server-rendered order summaries exclude private detail data', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/orders-privacy.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
