import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
test('public browser entries cannot select demo data or ship the synthetic catalog', () => {
  for (const file of ['src/presentation/cart/client/browser/cart-panel.ts', 'src/presentation/products/client/browser/product-panel.ts']) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.match(source, /const mode = STOREFRONT_DATA_MODE/);
    assert.doesNotMatch(source, /dataset\.cartMode/);
  }
  const bundle = readFileSync(resolve(root, 'src/presentation/cart/public/generated/cart.js'), 'utf8');
  assert.doesNotMatch(bundle, /TU MARCA|Maceta Espiral|Organizador Arco/);
});

test('one Nest package owns HTML, assets, JSON and development startup', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.workspaces, undefined);
  for (const dependency of ['next', 'react', 'react-dom', '@types/react', '@types/react-dom']) {
    assert.equal(pkg.dependencies?.[dependency], undefined);
    assert.equal(pkg.devDependencies?.[dependency], undefined);
  }
  assert.equal(pkg.dependencies['@nestjs/core'], '11.2.8');
  assert.equal(pkg.overrides.multer, '2.5.0');
  assert.match(pkg.scripts.dev, /tsx watch src\/main.ts/);
  assert.equal(pkg.scripts.start, 'node dist/main.js');
  assert.match(readFileSync(resolve(root, 'src/main.ts'), 'utf8'), /env\.PORT \|\| '3000'/);
  for (const path of ['src/main.ts', 'src/modules', 'src/infrastructure/database', 'src/presentation', 'tests/client']) {
    assert.ok(existsSync(resolve(root, path)), path);
  }
  for (const path of ['apps/api/package.json', 'apps/web/package.json', 'apps/web/src', 'apps/api/src']) {
    assert.equal(existsSync(resolve(root, path)), false, path);
  }
});

test('source imports do not retain the retired renderer or old workspace paths', () => {
  const source = resolve(root, 'src');
  assert.ok(existsSync(source));
  for (const file of readdirSync(source, { recursive: true }).map(String).filter(file => /\.(?:ts|tsx)$/.test(file))) {
    const contents = readFileSync(resolve(source, file), 'utf8');
    assert.doesNotMatch(contents, /(?:from\s*|import\s*\()['"](?:react(?:-dom)?(?:\/[^'"]*)?|next(?:\/[^'"]*)?)['"]/, file);
    assert.doesNotMatch(contents, /apps\/(?:web|api)\/src/, file);
  }
});
