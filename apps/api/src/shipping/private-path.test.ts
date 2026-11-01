import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('credential helper refuses a Git working tree and explicit destination override', { skip: process.platform !== 'win32' }, () => {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', resolve(process.cwd(), '../../scripts/test-zipnova-private-path.ps1')], { stdio: 'pipe' });
});
