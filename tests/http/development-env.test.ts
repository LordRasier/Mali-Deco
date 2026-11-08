import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = resolve(__dirname, '../..');

/** Stop at composition: synthetic DB_HOST must never initiate a database connection. */
function inspectStartup(env: NodeJS.ProcessEnv, contents?: string, privateContents?: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'mali-env-test-'));
  try {
    if (privateContents !== undefined) {
      writeFileSync(join(cwd, 'private.env'), privateContents);
      contents = `${contents ?? ''}\nZIPNOVA_ENV_FILE="${join(cwd, 'private.env')}"\n`;
    }
    if (contents !== undefined) writeFileSync(join(cwd, '.env'), contents);
    const childEnv: NodeJS.ProcessEnv = {
      SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP,
      TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), ...env,
    };
    const script = `
      require('reflect-metadata');
      require('@nestjs/core').NestFactory.create = async definition => {
        const imports = Reflect.getMetadata('imports', definition.module) ?? [];
        console.log(JSON.stringify({
          host: process.env.DB_HOST ?? null, port: process.env.PORT ?? null,
          hasDatabase: imports.some(item => item.module?.name === 'TypeOrmModule'),
          ...(${privateContents !== undefined} ? {
            hasToken: !!process.env.ZIPNOVA_API_TOKEN, hasSecret: !!process.env.ZIPNOVA_API_SECRET,
            shippingEnabled: process.env.ZIPNOVA_ENABLED, checkoutEnabled: process.env.LOCAL_TEST_CHECKOUT_ENABLED,
          } : {}),
        }));
        process.exit(0);
      };
      require(${JSON.stringify(join(root, 'src/main.ts'))});
    `;
    // Module resolution belongs to the project; only the optional env file belongs to cwd.
    const entry = join(cwd, 'probe.cjs');
    writeFileSync(entry, `const projectRequire = require('node:module').createRequire(${JSON.stringify(join(root, 'package.json'))});\n(function(require){${script}})(projectRequire);`);
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, entry], {
      // This bounds a child process, not startup performance. Windows cold module imports can exceed 20 seconds.
      cwd, env: childEnv, encoding: 'utf8', timeout: 60000,
    });
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code ?? 'none';
    assert.equal(result.status, 0, `Startup probe failed: code=${code}, signal=${result.signal ?? 'none'}`);
    return JSON.parse(result.stdout.trim());
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

test('npm dev loads optional local configuration before database module composition', () => {
  assert.deepEqual(inspectStartup({ npm_lifecycle_event: 'dev' }, 'NODE_ENV=development\nDB_HOST=synthetic.invalid\nPORT=3199\n'), {
    host: 'synthetic.invalid', port: '3199', hasDatabase: true,
  });
});

test('explicit process configuration takes precedence over the development file', () => {
  assert.deepEqual(inspectStartup({ npm_lifecycle_event: 'dev', DB_HOST: 'explicit.invalid', PORT: '3198' }, 'DB_HOST=local.invalid\nPORT=3199\n'), {
    host: 'explicit.invalid', port: '3198', hasDatabase: true,
  });
});

test('direct starts, tests and production do not consume local development configuration', () => {
  for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test', npm_lifecycle_event: 'dev' },
    { NODE_ENV: 'production', npm_lifecycle_event: 'dev', DB_HOST: 'production.invalid' }]) {
    const result = inspectStartup(env, 'DB_HOST=local.invalid\nPORT=3199\n');
    assert.equal(result.host, env.DB_HOST ?? null); assert.equal(result.port, null);
  }
});

test('npm dev without an env file keeps the existing explicit no-database fallback', () => {
  assert.deepEqual(inspectStartup({ npm_lifecycle_event: 'dev' }), { host: null, port: null, hasDatabase: false });
});

test('npm dev loads explicitly enabled private shipping credentials before service composition without enabling checkout', () => {
  assert.deepEqual(inspectStartup({ npm_lifecycle_event: 'dev' },
    'NODE_ENV=development\nZIPNOVA_ENABLED=true\nLOCAL_TEST_CHECKOUT_ENABLED=false\n',
    'ZIPNOVA_API_TOKEN=synthetic-token\nZIPNOVA_API_SECRET=synthetic-secret\nZIPNOVA_ENABLED=false\nLOCAL_TEST_CHECKOUT_ENABLED=true\n'), {
    host: null, port: null, hasDatabase: false, hasToken: true, hasSecret: true, shippingEnabled: 'true', checkoutEnabled: 'false',
  });
});
