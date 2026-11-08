import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SettingsPage } from './settings-page';
test('settings projects nullable public branding into one fixed private template', async () => {
  const page = new SettingsPage({ get: async () => ({ name: null, primaryColor: '#073dcc' }) });
  const result = await page.read({}); assert.equal(result.view, 'admin-settings'); assert.equal(result.model.section, 'settings'); assert.equal(result.model.name, '');
});
test('settings rejects query-controlled views before any service read', async () => {
  let reads = 0; const page = new SettingsPage({ get: async () => { reads++; return { name: 'Brand', primaryColor: '#073dcc' }; } });
  await assert.rejects(page.read({ layout: 'secret' })); assert.equal(reads, 0);
});
