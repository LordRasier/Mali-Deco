import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const output = resolve(root, 'dist');
if (dirname(output) !== root) throw Error('Build output must remain directly inside the project');
if (existsSync(output)) {
  if (lstatSync(output).isSymbolicLink() || realpathSync(output) !== output) throw Error('Refusing to clean redirected build output');
  rmSync(output, { recursive: true, force: true });
}
