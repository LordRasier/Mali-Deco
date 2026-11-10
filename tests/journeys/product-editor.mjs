/**
 * Opt-in local browser journey. Requires loopback MariaDB with an empty-password
 * root account, prepared browser assets, and an installed playwright-core/Chromium.
 * No project .env or existing schema is read; this process owns its temporary schema.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import process from 'node:process';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import { exerciseEditor } from './product-editor-steps.mjs';

const require = createRequire(import.meta.url);
require('tsx/cjs');
require('reflect-metadata');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
assert.equal(process.env.PRODUCT_EDITOR_JOURNEY, '1', 'Explicit local test opt-in required');
const schema = 'mali_editor_qa_' + randomUUID().replaceAll('-', '');
const loopback = '127.0.0.1';
const portProbe = createServer();
await new Promise((resolve, reject) => portProbe.once('error', reject).listen(0, loopback, resolve));
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
const origin = 'http://' + loopback + ':' + port;
Object.assign(process.env, { NODE_ENV: 'development', ADMIN_ORIGIN: origin, PUBLIC_SITE_URL: origin,
  DB_HOST: loopback, DB_PORT: '3306', DB_DATABASE: schema, DB_USERNAME: 'root', DB_PASSWORD: '',
  DB_ALLOW_EMPTY_PASSWORD: '1', ZIPNOVA_ENABLED: 'false', LOCAL_TEST_CHECKOUT_ENABLED: 'false' });
const admin = await mysql.createConnection({ host: loopback, port: 3306, user: 'root', password: '' });
let owned = false, db, app, browser;
try {
  const [[{ version }]] = await admin.query('SELECT VERSION() AS version');
  assert.match(version, /MariaDB/i);
  // Without IF NOT EXISTS, ownership cannot accidentally pass for an existing schema.
  await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [schema]);
  owned = true;
  const { StrictDataSource } = require('../../src/infrastructure/database/strict-data-source.ts');
  const { databaseOptions } = require('../../src/infrastructure/database/database-options.ts');
  db = new StrictDataSource(databaseOptions());
  await db.initialize();
  assert.equal((await db.query('SELECT DATABASE() AS db'))[0].db, schema);
  await db.runMigrations();
  const { hashPassword } = require('../../src/modules/identity/security/security.ts');
  const email = 'editor@example.test', password = randomUUID();
  await db.query('INSERT INTO admin_users(id,email,password_hash,role) VALUES(?,?,?,?)',
    [randomUUID(), email, await hashPassword(password), 'owner']);
  await db.query('INSERT INTO store_settings(id,store_name) VALUES(1,?)', ['Synthetic Store']);
  const { applicationModule } = require('../../src/app.module.ts');
  const { NestFactory } = require('@nestjs/core');
  const { configureHttp } = require('../../src/presentation/configure-http.ts');
  app = await NestFactory.create(applicationModule(process.env), { logger: false, abortOnError: false });
  configureHttp(app);
  await app.listen(port, loopback);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort());
  await exerciseEditor({ context, db, email, password });
  process.stdout.write('PASS: isolated admin editor lifecycle and public listing.\n');
} finally {
  try { await browser?.close(); } finally {
    try { await app?.close(); } finally {
      try { if (db?.isInitialized) await db.destroy(); } finally {
        try { if (owned) await admin.query('DROP DATABASE ??', [schema]); }
        finally { await admin.end(); }
      }
    }
  }
}
