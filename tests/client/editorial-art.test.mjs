import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('editorial art and explicitly identified fixture remain distinct from real product media', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', 'tests/client/editorial-art.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
