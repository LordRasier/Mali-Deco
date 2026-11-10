import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InformationController } from './information.controller';
import { informationPages, type InformationPageKey } from './information-content';
import { storeInformation, StoreInformationReader } from './store-information';
import { createViewEngine } from '../view-engine';
import { pageMetadata } from '../seo/metadata';
import { defaultSiteConfig } from '../../modules/settings/site-config';
import { defaultContentConfig, pagePaths } from '../../modules/settings/content-config';

test('public contact configuration exposes only allowed fields and rejects unsafe links', () => {
  const configured = storeInformation({ STORE_CONTACT_EMAIL: 'hola@example.test', STORE_WHATSAPP_NUMBER: '+54 (9) 223-555-0123',
    STORE_INSTAGRAM_USERNAME: '@mali_example', STORE_DATA_FISCAL_URL: 'https://serviciosweb.afip.gob.ar/qr/?p=example',
    MERCADOPAGO_TEST_ACCESS_TOKEN: 'private-test-secret' });
  assert.equal(configured.channels.length, 3);
  assert.equal(configured.channels[1].href, 'https://wa.me/5492235550123');
  assert.equal(configured.channels[2].href, 'https://www.instagram.com/mali_example/');
  assert.ok(configured.dataFiscalUrl?.startsWith('https://serviciosweb.afip.gob.ar/'));
  assert.ok(!JSON.stringify(configured).includes('private-test-secret'));
  for (const url of ['javascript:alert(1)', 'http://arca.gob.ar/qr', 'https://arca.gob.ar.evil.test/', 'https://evil-arca.gob.ar/', 'https://user:pass@arca.gob.ar/']) {
    assert.equal(storeInformation({ STORE_DATA_FISCAL_URL: url }).dataFiscalUrl, undefined);
  }
  const invalid = storeInformation({ STORE_CONTACT_EMAIL: 'a%0abcc=evil@example.test', STORE_WHATSAPP_NUMBER: 'javascript:alert(1)', STORE_INSTAGRAM_USERNAME: 'https://evil.test' });
  assert.equal(invalid.hasContact, false);
  assert.deepEqual(invalid.channels, []);
});

async function renderedPage(key: InformationPageKey, env: NodeJS.ProcessEnv = {}, unavailable = false) {
  const info = storeInformation(env);
  const catalog = { settings: async () => { if (unavailable) throw new Error('offline'); return { name: '<MALI>' }; } };
  const controller = new InformationController(catalog, 'api', false, { get: async () => info });
  let model: Record<string, unknown> = {};
  await controller.render(key, { render(view, data) { assert.equal(view, 'information-page'); model = { ...data }; } });
  const engine = createViewEngine({
    information_body: readFileSync(join(__dirname, 'views/partials/body.hbs'), 'utf8'),
    seo_head: readFileSync(join(__dirname, '../seo/views/head.hbs'), 'utf8'),
    site_header: readFileSync(join(__dirname, '../shell/views/header.hbs'), 'utf8'),
    site_footer: readFileSync(join(__dirname, '../shell/views/footer.hbs'), 'utf8'),
    cart_panel: readFileSync(join(__dirname, '../cart/views/partials/cart-panel.hbs'), 'utf8'),
  });
  return new Promise<string>((resolve, reject) => engine.__express(join(__dirname, 'views/information-page.hbs'),
    { ...model, seo: pageMetadata('information-page', model, '/' + key, new URLSearchParams(), 200, defaultSiteConfig(), { NODE_ENV: 'production' }), storeYear: 2026 }, (error, html) => error ? reject(error) : resolve(html ?? '')));
}

test('information pages render their anchors, shared footer and cart with escaped content', async () => {
  for (const key of Object.keys(informationPages) as InformationPageKey[]) {
    const html = await renderedPage(key);
    assert.match(html, /&lt;MALI&gt;/);
    assert.doesNotMatch(html, /<MALI>/);
    assert.match(html, /data-cart-dialog/);
    assert.match(html, /id="pie-de-pagina"/);
    for (const { id } of defaultContentConfig().pages[key].sections) {
      assert.ok(html.includes(`href="#${id}"`), `${key} link ${id}`);
      assert.ok(html.includes(`id="${id}"`), `${key} target ${id}`);
    }
    for (const target of Object.values(pagePaths)) assert.ok(html.includes(`href="${target}"`), `${key} footer ${target}`);
    assert.doesNotMatch(html, /href="#"|mailto:|wa\.me|<form/);
  }
  const fallback = await renderedPage('preguntas-frecuentes', {}, true);
  assert.match(fallback, /Preguntas frecuentes \| Tienda/);
});

test('unconfigured contact and legal pages stay honest and noindex until configured', async () => {
  const empty = await renderedPage('contacto');
  assert.match(empty, /Estamos preparando nuestros canales/);
  assert.match(empty, /noindex, follow/);
  const configured = await renderedPage('politica-de-privacidad', { STORE_CONTACT_EMAIL: 'hola@example.test',
    STORE_LEGAL_NAME: '<script>not markup</script>', STORE_LEGAL_ADDRESS: 'Domicilio de prueba' });
  assert.doesNotMatch(configured, /noindex|<script>not markup/);
  assert.match(configured, /&lt;script&gt;not markup&lt;\/script&gt;/);
  assert.match(configured, /href="mailto:hola@example.test"/);
});

test('saved social values override initial config immediately and empty values hide the buttons', async () => {
  const base = storeInformation({ STORE_WHATSAPP_NUMBER: '5492235550123', STORE_INSTAGRAM_USERNAME: 'old_example' });
  const saved = { name: 'Mali', primaryColor: '#073dcc', whatsappNumber: '', instagramUsername: 'new_example' };
  const reader = new StoreInformationReader(base, { get: async () => saved });
  assert.equal((await reader.get()).whatsapp, undefined);
  assert.equal((await reader.get()).instagram?.href, 'https://www.instagram.com/new_example/');
  saved.instagramUsername = ''; assert.equal((await reader.get()).hasSocial, false);
  const offline = new StoreInformationReader(base, { get: async () => { throw new Error('offline'); } });
  assert.equal((await offline.get()).whatsapp?.href, 'https://wa.me/5492235550123');
});

test('footer social buttons render safe chat/profile destinations with accessible icons', async () => {
  const html = await renderedPage('sobre-mali', { STORE_WHATSAPP_NUMBER: '5492235550123', STORE_INSTAGRAM_USERNAME: 'mali_example' });
  const footer = html.slice(html.indexOf('<footer'));
  assert.match(footer, /href="https:\/\/wa.me\/5492235550123"/);
  assert.match(footer, /href="https:\/\/www.instagram.com\/mali_example\/"/);
  assert.equal((footer.match(/class="site-footer-social-button"/g) ?? []).length, 2);
  assert.match(footer, /aria-label="Abrir chat de WhatsApp/);
  assert.match(footer, /aria-label="Ver Instagram/);
  assert.match(footer, /rel="noopener noreferrer"/);
});
