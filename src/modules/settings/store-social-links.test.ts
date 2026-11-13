import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource, QueryRunner } from 'typeorm';
import { StoreSettings } from './store-settings';
import { normalizeInstagramUsername, normalizeWhatsAppNumber } from '../../shared/social-links';
import { StoreSocialLinks1793361500000 } from '../../infrastructure/database/migrations/1793361500000-store-social-links';

test('social links accept international numbers and Instagram profiles, never arbitrary URLs', () => {
  assert.equal(normalizeWhatsAppNumber('+54 (9) 223-555-0123'), '5492235550123');
  assert.equal(normalizeInstagramUsername('https://www.instagram.com/Mali_Example/?igsh=example'), 'mali_example');
  assert.equal(normalizeInstagramUsername('@Mali.Example'), 'mali.example');
  assert.equal(normalizeWhatsAppNumber(''), ''); assert.equal(normalizeInstagramUsername(' '), '');
  for (const value of [null, 123, '012345678', '549\n2235550123', 'https://wa.me/5492235550123', 'javascript:alert(1)', '1'.repeat(16)]) assert.equal(normalizeWhatsAppNumber(value), null);
  for (const value of [null, 123, 'https://instagram.com.evil.test/user', 'https://evil@instagram.com/user', 'http://instagram.com/user', 'https://instagram.com/p/post', 'javascript:alert(1)', 'a'.repeat(31), 'two..dots', 'trailing.']) assert.equal(normalizeInstagramUsername(value), null);
});

test('social settings persist atomically, preserve omitted fields and support explicit clearing', async () => {
  const calls: { sql: string; args?: unknown[] }[] = [];
  const db = { isInitialized: true, query: async (sql: string, args?: unknown[]) => { calls.push({ sql, args }); return [{ name: 'Mali', primaryColor: '#073dcc', whatsappNumber: '5492235550123', instagramUsername: 'mali_example' }]; } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  assert.deepEqual(await settings.set({ name: 'Mali', whatsappNumber: '+54 9 223 5550123', instagramUsername: '@Mali_Example' }), { name: 'Mali', whatsappNumber: '5492235550123', instagramUsername: 'mali_example' });
  assert.deepEqual(calls[0].args, ['Mali', '5492235550123', 'mali_example']);
  assert.equal((await settings.get()).whatsappNumber, '5492235550123');
  await settings.set({ name: 'Mali', whatsappNumber: '' });
  assert.deepEqual(calls.at(-1)?.args, ['Mali', '']); assert.doesNotMatch(calls.at(-1)!.sql, /instagram_username|primary_color/);
  const before = calls.length;
  await assert.rejects(settings.set({ name: 'Other', primaryColor: '#112233', whatsappNumber: 'invalid' }), { status: 400 });
  assert.equal(calls.length, before);
});

test('old schema keeps appearance available and refuses to acknowledge a social save', async () => {
  const calls: string[] = [];
  const db = { isInitialized: true, query: async (sql: string) => {
    calls.push(sql);
    if (/whatsapp_number|instagram_username/.test(sql)) throw Object.assign(Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });
    return [{ name: 'Mali', primaryColor: '#112233' }];
  } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  assert.deepEqual(await settings.get(), { name: 'Mali', primaryColor: '#112233' });
  await assert.rejects(settings.set({ name: 'Mali', whatsappNumber: '' }), { status: 503 });
  await settings.set({ name: 'Mali', primaryColor: '#223344' });
  assert.doesNotMatch(calls.at(-1)!, /whatsapp_number|instagram_username/);
});

test('a migrated but empty settings table still enables the first social configuration', async () => {
  const db = { isInitialized: true, query: async () => [] } as unknown as DataSource;
  assert.deepEqual(await new StoreSettings(db).get(), { name: null, primaryColor: '#073dcc', headerBrandMode: 'logo_text', whatsappNumber: null, instagramUsername: null });
});

test('social migration only adds fields and refuses rollback of configured values', async () => {
  const calls: string[] = [];
  const q = { query: async (sql: string) => { calls.push(sql); return [{ total: 1 }]; } } as unknown as QueryRunner;
  const migration = new StoreSocialLinks1793361500000();
  await migration.up(q); assert.match(calls[0], /ADD COLUMN whatsapp_number/); assert.match(calls[0], /ADD COLUMN instagram_username/);
  assert.doesNotMatch(calls[0], /DROP|DELETE/);
  await assert.rejects(migration.down(q), /configured social links/);
});
