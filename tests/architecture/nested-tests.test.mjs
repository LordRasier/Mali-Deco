import assert from 'node:assert/strict';
import { test } from 'node:test';
import { childEnvironment } from '../client/support/test-environment.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('nested test processes never inherit the parent test runner context', () => {
  const parent = { NODE_TEST_CONTEXT: 'child-v8', PATH: 'synthetic-path' };
  const child = childEnvironment(parent);
  assert.equal(child.NODE_TEST_CONTEXT, undefined);
  assert.equal(child.PATH, parent.PATH);
  assert.equal(parent.NODE_TEST_CONTEXT, 'child-v8');
});

test('a failing nested test actually executes and fails its parent subprocess', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mali-nested-test-'));
  try {
    const file = join(directory, 'canary.test.mjs');
    writeFileSync(file, "import { test } from 'node:test'; test('canary executed', () => { throw Error('intentional failure'); });");
    const result = spawnSync(globalThis.process.execPath, ['--test', file], {
      encoding: 'utf8', env: childEnvironment({ ...globalThis.process.env, NODE_TEST_CONTEXT: 'child-v8' }),
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /intentional failure/);
    assert.doesNotMatch(result.stderr, /skipping running files/);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
