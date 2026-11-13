import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  absWorkingDir: root, entryPoints: ['src/presentation/browser/browser.ts'],
  outfile: 'cart.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  write: false, metafile: true, sourcemap: false, minify: true, legalComments: 'none',
});
// Audit the graph before writing anything that can be served; never ship server dependencies.
for (const [input, metadata] of Object.entries(result.metafile.inputs)) {
  // The existing public catalog parser reuses this pure currency precision helper.
  if (!input.startsWith('src/presentation/checkout/client/') && !input.startsWith('src/presentation/cart/client/') && !input.startsWith('src/presentation/catalog/client/') && !input.startsWith('src/presentation/products/client/') && !input.startsWith('src/presentation/shipping/client/') && !input.startsWith('src/presentation/shared/') && !input.startsWith('src/presentation/catalog/shared/') && !['src/presentation/browser/browser.ts', 'src/presentation/browser/site-header.ts', 'src/presentation/admin/client/money.ts', 'src/shared/product-discount.ts', 'src/shared/public-variant-name.ts'].includes(input)) throw new Error(`Unexpected browser dependency: ${input}`);
  if (metadata.imports.some(item => item.external)) throw new Error(`External browser import: ${input}`);
}
for (const output of Object.values(result.metafile.outputs)) if (output.imports.length) throw new Error('Browser bundle must be self-contained');
// Includes the shared public property selectors and labels on cards and product detail.
// Includes sharing and the pure discount renderer/arithmetic (~1.2 KB additional); no SDKs or server dependencies.
// Checkout now restores a server-owned draft and coordinates payment/return states (~3 KB above the previous ceiling).
// Verified purchase reconciliation includes a durable cart receipt; still no new dependencies.
// Variant image selection and matching cover defaults add ~1.5 KB; no new dependencies.
if (result.outputFiles.length !== 1 || result.outputFiles[0].contents.length > 116000) throw new Error('Unexpected browser output size');
const file = result.outputFiles[0];
if (/process\.env|sourceMappingURL|__webpack_require__/.test(file.text)) throw new Error('Unexpected runtime or environment dependency');
const destination = resolve(root, 'src/presentation/cart/public/generated/cart.js');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, file.contents);
globalThis.console.log(`Built audited cart client: ${file.contents.length} bytes, ${Object.keys(result.metafile.inputs).length} source modules.`);
