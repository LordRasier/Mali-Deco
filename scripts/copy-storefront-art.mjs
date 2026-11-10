import { copyFileSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Approved source artwork is private build input; generated copies are ignored.
const source = resolve(root, 'resources/storefront');
const output = join(root, 'src/presentation/home/public/generated/storefront');
const files = ['florero-ondas.webp', 'hero-3d-objects-960.webp', 'hero-3d-objects.webp', 'maceta-geometrica.webp', 'organizador-arco.webp'];
// Validate the whole input set first. A stale generated copy must not hide missing source artwork.
for (const file of files) if (!lstatSync(join(source, file)).isFile()) throw Error(`Artwork must be a regular file: ${file}`);
mkdirSync(output, { recursive: true });
for (const file of files) copyFileSync(join(source, file), join(output, file));
globalThis.console.log(`Prepared ${files.length} approved storefront images.`);
