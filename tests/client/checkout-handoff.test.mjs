import { spawnSync } from 'node:child_process';
import process from 'node:process';
import assert from 'node:assert/strict';
import test from 'node:test';
test('checkout delivery handoff', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/client/checkout-handoff.check.ts'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
