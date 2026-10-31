import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('mobile navigation opens at the first link, closes on Escape and on leaving the header', () => {
  execFileSync(globalThis.process.execPath, ['tests/header-menu.check.cjs'], { stdio: 'pipe' });
});
