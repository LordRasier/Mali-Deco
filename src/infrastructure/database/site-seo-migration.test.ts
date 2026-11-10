import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { SiteSeo1793361700000 } from './migrations/1793361700000-site-seo';

test('SEO rollback refuses to discard either saved settings or product URL history', async () => {
  const migration = new SiteSeo1793361700000();
  for (const [settings, redirects] of [[1, 0], [0, 1], [1, 1]]) {
    let drops = 0;
    const runner = { query: async (sql: string) => { if (sql.startsWith('DROP')) drops++; return [{ total: sql.includes('store_site_settings') ? settings : redirects }]; } } as unknown as QueryRunner;
    await assert.rejects(migration.down(runner), /Cannot discard/); assert.equal(drops, 0);
  }
});
