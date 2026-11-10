import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({ absWorkingDir: root, entryPoints: ['src/presentation/admin/client/browser/browser.ts'],
  outfile: 'admin.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  write: false, metafile: true, sourcemap: false, minify: true, legalComments: 'none' });
for (const [input, metadata] of Object.entries(result.metafile.inputs)) {
  if (!input.startsWith('src/presentation/admin/client/') && !input.startsWith('src/presentation/admin/shared/') && input !== 'src/presentation/catalog/shared/money.ts' && input !== 'src/shared/social-links.ts' && input !== 'src/modules/settings/site-config.ts') throw Error(`Unexpected admin browser dependency: ${input}`);
  if (metadata.imports.some(item => item.external)) throw Error(`External admin browser import: ${input}`);
}
if (result.outputFiles.length !== 2) throw Error('Expected self-contained admin JS and CSS');
for (const file of result.outputFiles) {
  const name = basename(file.path);
  // Grouped page navigation and listing controls add ~4.6 KiB; server defaults remain outside the browser.
  const budget = name === 'admin.js' ? 148000 : 76000;
  if (!['admin.js', 'admin.css'].includes(name) || file.contents.length > budget || /process\.env|sourceMappingURL|__webpack_require__/.test(file.text)) throw Error(`Unexpected admin browser output: ${name} (${file.contents.length} bytes)`);
  const destination = resolve(root, 'src/presentation/admin/public/generated', name);
  mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, file.contents);
}
globalThis.console.log(`Built audited admin client: ${Object.keys(result.metafile.inputs).length} source modules.`);
