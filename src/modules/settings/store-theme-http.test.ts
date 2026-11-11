import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { StoreSettings } from './store-settings';
import { StoreThemeController } from './store-theme.controller';
import { ContentSettings } from './content-settings';

test('public theme is a noncached stylesheet without exposing private settings', async () => {
  const module = await Test.createTestingModule({ controllers: [StoreThemeController], providers: [
    { provide: StoreSettings, useValue: { get: async () => ({ name: 'Private fixture', primaryColor: '#bb1122' }) } },
    { provide: ContentSettings, useValue: new ContentSettings() },
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1'); const response = await fetch(await app.getUrl() + '/catalog/theme.css');
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /text\/css/);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const css = await response.text(); assert.match(css, /--blue:#bb1122/); assert.doesNotMatch(css, /Private fixture/);
  } finally { await app.close(); }
});
