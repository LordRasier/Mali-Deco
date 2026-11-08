import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('art preparation copies exactly approved bytes and fails rather than trusting stale copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'mali-art-'));
  try {
    const api = root, source = join(root, 'resources/storefront');
    mkdirSync(join(api, 'scripts'), { recursive: true }); mkdirSync(source, { recursive: true });
    copyFileSync(resolve(__dirname, '../../scripts/copy-storefront-art.mjs'), join(api, 'scripts/copy-storefront-art.mjs'));
    const files = ['florero-ondas.webp', 'hero-3d-objects-960.webp', 'hero-3d-objects.webp', 'maceta-geometrica.webp', 'organizador-arco.webp'];
    for (const file of files) writeFileSync(join(source, file), 'synthetic:' + file);
    writeFileSync(join(source, '.env'), 'synthetic-neighbor');
    const run = () => spawnSync(process.execPath, ['scripts/copy-storefront-art.mjs'], { cwd: api, encoding: 'utf8' });
    assert.equal(run().status, 0);
    const output = join(api, 'src/presentation/home/public/generated/storefront');
    assert.deepEqual(readdirSync(output).sort(), [...files].sort());
    for (const file of files) assert.deepEqual(readFileSync(join(output, file)), readFileSync(join(source, file)));
    assert.equal(existsSync(join(output, '.env')), false);
    rmSync(join(source, files[0])); assert.notEqual(run().status, 0);
  } finally { assert.equal(dirname(resolve(root)), resolve(tmpdir())); rmSync(root, { recursive: true, force: true }); }
});
