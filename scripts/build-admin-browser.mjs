import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({ absWorkingDir: root, entryPoints: ['src/presentation/admin/client/browser/browser.ts'],
  outfile: 'admin.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  write: false, metafile: true, sourcemap: false, minify: true, legalComments: 'none' });
for (const [input, metadata] of Object.entries(result.metafile.inputs)) {
  if (!input.startsWith('src/presentation/admin/client/') && !input.startsWith('src/presentation/admin/shared/') && input !== 'src/presentation/catalog/shared/money.ts' && input !== 'src/shared/social-links.ts') throw Error(`Unexpected admin browser dependency: ${input}`);
  if (metadata.imports.some(item => item.external)) throw Error(`External admin browser import: ${input}`);
}
if (result.outputFiles.length !== 2) throw Error('Expected self-contained admin JS and CSS');
for (const file of result.outputFiles) {
  const name = basename(file.path);
  // Includes variant tools, settings tabs and social-link validation; measured JS is 113.9 kB, without external dependencies.
  if (!['admin.js', 'admin.css'].includes(name) || file.contents.length > 114000 || /process\.env|sourceMappingURL|__webpack_require__/.test(file.text)) throw Error('Unexpected admin browser output');
  const destination = resolve(root, 'src/presentation/admin/public/generated', name);
  mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, file.contents);
}
globalThis.console.log(`Built audited admin client: ${Object.keys(result.metafile.inputs).length} source modules.`);
