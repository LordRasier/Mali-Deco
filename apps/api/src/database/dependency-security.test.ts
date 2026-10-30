import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

test('Nest resolves the patched Multer version from its own dependency path', () => {
  const localRequire = createRequire(__filename);
  const nestRequire = createRequire(localRequire.resolve('@nestjs/platform-express'));
  const manifest = JSON.parse(readFileSync(nestRequire.resolve('multer/package.json'), 'utf8')) as { version: string };
  assert.equal(manifest.version, '2.5.0');
});
