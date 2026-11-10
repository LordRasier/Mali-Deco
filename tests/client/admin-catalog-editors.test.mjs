import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('MVC variants and classifications preserve validation, drafts and authoritative write boundaries', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/admin-variants.check.ts',
    'tests/client/admin-classifications.check.ts', 'tests/client/admin-classifications-dom.check.ts', 'tests/client/admin-product-media-slot.check.ts', 'tests/client/admin-variant-arbitration.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
