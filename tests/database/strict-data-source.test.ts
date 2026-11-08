import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSourceOptions } from 'typeorm';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';

test('rejects unsupported or unsafe lifecycle options before connecting', () => {
  for (const options of [
    { type: 'mysql', synchronize: false },
    { type: 'mariadb', synchronize: true },
    { type: 'mariadb', synchronize: false, migrationsRun: true },
    { type: 'mariadb', synchronize: false, dropSchema: true },
    { type: 'mariadb', synchronize: false, replication: {} },
  ]) assert.throws(() => new StrictDataSource(options as DataSourceOptions), /Unsafe/);
});
