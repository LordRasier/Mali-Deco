import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('production build is rooted in source and the unit runner includes isolated test support', () => {
  const read = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../..', name), 'utf8'));
  const build = read('tsconfig.build.json');
  const typecheck = read('tsconfig.json');
  const manifest = read('package.json');
  assert.equal(build.compilerOptions?.rootDir, 'src');
  assert.deepEqual(build.include, ['src/**/*.ts']);
  assert.ok(build.exclude.includes('src/**/*.test.ts'));
  assert.ok(typecheck.include.includes('tests/**/*.ts'));
  assert.equal(manifest.scripts['test:server'], 'tsx --test src/**/*.test.ts tests/**/*.test.ts');
  assert.equal(manifest.scripts['test:client'], 'node --test tests/client/*.test.mjs');
  assert.match(manifest.scripts.test, /prepare:assets/);
  assert.equal(manifest.scripts['test:integration'], 'tsx --test tests/integration/*.integration.ts');
});
