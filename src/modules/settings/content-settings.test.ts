import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { ContentSettings, ContentSettingsController } from './content-settings';
import { defaultContentConfig, contentHref } from './content-config';
import { normalizeSections, parseContentConfig, parseStoredContentConfig } from './content-validation';
import { OwnerGuard } from '../identity/http/owner.guard';
import { renderOrderEmail } from '../order-emails/order-email-template';
import { exampleEmailOrder } from '../order-emails/order-email-model';

const defaults = () => normalizeSections(defaultContentConfig());

test('older saved content gains listing controls without replacing text or reactivating pages', () => {
  const config = defaults(), information: Record<string, unknown> = { ...config.copy.information };
  config.pages['politica-de-privacidad'].enabled = false;
  config.pages['terminos-y-condiciones'].sections[0].paragraphs = ['Condiciones propias de esta instalación.'];
  config.footer.description = 'Tienda Runica';
  const legacy: Record<string, unknown> = { ...config, copy: { ...config.copy, information } };
  delete legacy.listing;
  for (const key of ['indexTitle', 'contactTitle', 'hoursLabel', 'legalEyebrow', 'legalTitle']) delete information[key];
  const upgraded = parseStoredContentConfig(legacy);
  assert.equal(upgraded.pages['politica-de-privacidad'].enabled, false);
  assert.equal(upgraded.pages['terminos-y-condiciones'].sections[0].paragraphs![0], 'Condiciones propias de esta instalación.');
  assert.equal(upgraded.footer.description, 'Tienda Runica'); assert.equal(upgraded.listing.pageSize, '24');
  assert.throws(() => parseContentConfig(legacy), 'Only stored reads accept the older schema');
  const invalid = defaults(); invalid.listing.columns = '100'; assert.throws(() => parseContentConfig(invalid));
  invalid.listing.columns = '2'; invalid.listing.pageSize = '-1'; assert.throws(() => parseContentConfig(invalid));
});
test('saved listing settings gain opt-in filters while preserving the existing store design', () => {
  const config = defaults(); config.listing.columns = '4'; config.listing.categoriesEnabled = false; config.listing.itemPlural = 'mazos';
  const listing: Record<string, unknown> = { ...config.listing }; delete listing.filtersEnabled;
  const legacy = { ...config, listing }, upgraded = parseStoredContentConfig(legacy);
  assert.deepEqual(upgraded.listing, { ...listing, filtersEnabled: false });
  assert.throws(() => parseContentConfig(legacy));
  assert.equal(parseContentConfig({ ...config, listing: { ...listing, filtersEnabled: true } }).listing.filtersEnabled, true);
  assert.throws(() => parseStoredContentConfig({ ...config, listing: { ...listing, filtersEnabled: 'true' } }));
  assert.throws(() => parseStoredContentConfig({ ...config, listing: { ...listing, unknown: true } }));
});

test('content validation bounds and validates editable blocks and rejects scripts and unknown fields', () => {
  assert.deepEqual(parseContentConfig(defaults()), defaults());
  for (const mutate of [
    (c: ReturnType<typeof defaults>) => { c.pages.contacto.title = '<script>alert(1)</script>'; },
    (c: ReturnType<typeof defaults>) => { c.pages.contacto.sections[0].links = [{ href: 'javascript:alert(1)', label: 'Click' }]; },
    (c: ReturnType<typeof defaults>) => { c.pages.contacto.sections[0].links = [{ href: '//evil.test', label: 'Click' }]; },
    (c: ReturnType<typeof defaults>) => { c.footer.columns[0].links[0].target = '/admin'; },
    (c: ReturnType<typeof defaults>) => { c.pages.contacto.sections.push(c.pages.contacto.sections[0]); },
    (c: ReturnType<typeof defaults>) => { c.contact.dataFiscalUrl = 'https://arca.gob.ar.evil.test'; },
    (c: ReturnType<typeof defaults>) => { c.pages.contacto.contact = false; },
  ]) { const config = defaults(); mutate(config); assert.throws(() => parseContentConfig(config)); }
  assert.throws(() => parseContentConfig({ ...defaults(), secret: 'extra' }));
});
test('content uses owner permissions, revisions and independent installation storage', async () => {
  const first = defaults(); first.pages['envios-y-reembolsos'].sections[0].paragraphs![0] = 'Texto independiente';
  assert.notEqual(defaults().pages['envios-y-reembolsos'].sections[0].paragraphs![0], 'Texto independiente');
  assert.deepEqual(Reflect.getMetadata('__guards__', ContentSettingsController), [OwnerGuard]);
  const database = () => {
    let row: { config: string; revision: number } | undefined;
    const query = async (sql: string, args: unknown[] = []) => {
      if (sql.startsWith('SELECT')) return row ? [row] : [];
      if (sql.startsWith('INSERT')) { row ??= { config: String(args[0]), revision: 0 }; return {}; }
      if (row && row.revision === args[1]) { row = { config: String(args[0]), revision: row.revision + 1 }; return { affectedRows: 1 }; }
      return { affectedRows: 0 };
    };
    return { isInitialized: true, query, transaction: (run: (manager: { query: typeof query }) => unknown) => run({ query }) } as unknown as DataSource;
  };
  const mali = new ContentSettings(database()), runica = new ContentSettings(database());
  const config = defaults(); config.copy.home.title = 'Equipá tu mazo'; config.pages.cuidados.enabled = false;
  assert.equal((await runica.set({ settings: config, revision: 0 })).revision, 1);
  await assert.rejects(runica.set({ settings: config, revision: 0 }), { status: 409 });
  assert.equal((await mali.get()).settings.pages.cuidados.enabled, true);
  assert.equal((await runica.get()).settings.copy.home.title, 'Equipá tu mazo');
});
test('database errors never republish disabled content, and missing migrations cannot accept writes', async () => {
  const failed = new ContentSettings({ isInitialized: true, query: async () => { throw Error('offline'); } } as unknown as DataSource);
  await assert.rejects(failed.get(), { status: 503 });
  await assert.rejects(new ContentSettings({ isInitialized: false } as DataSource).get(), { status: 503 });
  const missing = new ContentSettings({ isInitialized: true, query: async () => { throw { code: 'ER_NO_SUCH_TABLE' }; } } as unknown as DataSource);
  assert.equal((await missing.get()).available, false);
  await assert.rejects(new ContentSettings().set({ settings: defaults(), revision: 0 }), { status: 503 });
});
test('new emails use configured copy and omit links to disabled pages', () => {
  const config = defaults(); config.copy.email.delivered.title = '¡Tu mazo está listo!';
  config.pages.cuidados.enabled = false; config.pages.contacto.enabled = false; config.pages['envios-y-reembolsos'].enabled = false;
  assert.equal(contentHref(config, '/preguntas-frecuentes#cuidados'), '');
  assert.equal(contentHref(config, '/CONTACTO/'), ''); assert.equal(contentHref(config, '/%63ontacto'), '');
  const email = renderOrderEmail('delivered', exampleEmailOrder, { name: 'Runica', primaryColor: '#663399', siteUrl: 'https://runica.example', bannerUrl: '' }, undefined, config);
  assert.match(email.html, /Tu mazo está listo/);
  assert.doesNotMatch(email.html, /href=""|href="https:\/\/runica.example\/(contacto|cuidados|envios-y-reembolsos)/);
  assert.doesNotMatch(email.text, /https:\/\/runica.example\/(contacto|cuidados|envios-y-reembolsos)/);
});
