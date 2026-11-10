import { childEnvironment } from './support/test-environment.mjs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('MVC products preserve forms, authoritative writes and retained lifecycle', () => {
  execFileSync(globalThis.process.execPath, ['--import', 'tsx', '--test', 'tests/client/admin-products.check.ts',
    'tests/client/admin-product-runtime.check.ts', 'tests/client/admin-product-dom.check.ts', 'tests/client/admin-product-quick-edit.check.ts', 'tests/client/admin-features.check.ts'], { stdio: 'pipe', env: childEnvironment() });
});
