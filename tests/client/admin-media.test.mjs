import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('shared admin media state and native widget preserve upload intent and lifecycle safety', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/admin-media-state.check.ts', 'tests/client/admin-media-dom.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
