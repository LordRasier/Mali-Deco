import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'node:http';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';

async function application(enabled: boolean, run: (origin: string) => Promise<void>) {
  const saved = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.STOREFRONT_MODE = 'demo';
  process.env.ZIPNOVA_ENABLED = 'false'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const env = { NODE_ENV: 'development', STOREFRONT_MODE: 'demo', MVC_PILOT_ENABLED: String(enabled) };
  try {
    const { applicationModule } = await import('../../src/app.module');
    app = (await Test.createTestingModule({ imports: [applicationModule(env)] })
      .overrideProvider(PublicCatalog).useValue(publicCatalogFixture)
      .overrideProvider(PublicFacets).useValue(publicFacetsFixture).compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.listen(0, '127.0.0.1'); await run(await app.getUrl());
  } finally { await app?.close(); process.env = saved; }
}
test('home SSR preserves editorial images, collection anchors and a shared accessible shell', async () => {
  await application(true, async origin => {
    const response = await fetch(origin + '/?layout=missing');
    assert.equal(response.status, 200); const html = await response.text();
    for (const fragment of ['data-site-header', 'data-cart-open', 'id="coleccion"', 'id="historia"', '/api/v1/catalog/branding/hero', 'fetchpriority="high"', 'Florero Ondas']) assert.ok(html.includes(fragment), fragment);
    const navigation = html.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)![0];
    assert.equal((navigation.match(/<a /g) ?? []).length, 1);
    assert.match(navigation, /href="\/catalogo">Ver Productos<\/a>/);
    assert.doesNotMatch(html, /data-menu-toggle|data-search-toggle|id="store-search"|id="header-search"/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy') ?? '', /form-action 'self'/);
    for (const route of ['/catalogo?currency=ARS', '/productos/florero-ondas']) {
      const page = await (await fetch(origin + route)).text(); assert.match(page, /data-site-header/); assert.match(page, /class="site-footer"/);
      assert.doesNotMatch(page, /data-search-toggle|id="store-search"/);
    }
    assert.equal((await fetch(origin + '/api/v1/')).status, 404);
    assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 404);
  });
});
test('shared header centers the product link independently of side controls and keeps it visible on mobile', () => {
  const css = readFileSync(resolve(__dirname, '../../src/presentation/shell/public/shell.css'), 'utf8');
  assert.match(css, /\.site-header\s*\{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css, /\.site-nav\s*\{[^}]*justify-content:center/);
  assert.match(css, /\.site-actions\s*\{[^}]*justify-self:end/);
  assert.match(css, /@media\(max-width:599px\)[\s\S]*\.site-nav\s*\{[^}]*grid-column:1 \/ -1/);
  assert.doesNotMatch(css, /data-menu-open|data-menu-toggle|\.site-header\[data-enhanced\] \.site-nav/);
});

test('shipping and returns are public HTML with working section links, cart and allowlisted styles', async () => {
  await application(false, async origin => {
    const response = await fetch(origin + '/envios-y-reembolsos');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    const html = await response.text();
    assert.match(html, /<title>Envíos y reembolsos \|/);
    assert.match(html, /href="\/api\/v1\/catalog\/theme.css"/);
    for (const id of ['envios', 'seguimiento', 'devoluciones', 'reembolsos', 'ayuda']) {
      assert.ok(html.includes(`href="#${id}"`), id);
      assert.ok(html.includes(`id="${id}"`), id);
    }
    assert.match(html, /data-cart-dialog/);
    assert.match(html, /data-cart-mode="api"/);
    assert.doesNotMatch(html, /href="\/checkout"|<form|mailto:|wa\.me/);
    const home = await (await fetch(origin + '/')).text();
    assert.match(home, /<footer\b[^>]*>[\s\S]*href="\/envios-y-reembolsos"/);
    const css = await fetch(origin + '/assets/storefront/information.css');
    assert.equal(css.status, 200); assert.match(css.headers.get('content-type') ?? '', /text\/css/);
    assert.equal((await fetch(origin + '/assets/storefront/shipping-returns.hbs')).status, 404);
    assert.equal((await fetch(origin + '/api/v1/envios-y-reembolsos')).status, 404);
    assert.equal((await fetch(origin + '/envios-y-reembolsos', { method: 'POST' })).status, 404);
  });
});

test('all approved editorial image bytes are served locally, never neighboring files', async () => {
  await application(true, async origin => {
    for (const file of ['florero-ondas.webp', 'hero-3d-objects-960.webp', 'hero-3d-objects.webp', 'maceta-geometrica.webp', 'organizador-arco.webp']) {
      const response = await fetch(origin + '/storefront/' + file); assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /image\/webp/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(resolve(__dirname, '../../resources/storefront', file)));
    }
    for (const file of ['.env', 'README.md']) assert.equal((await fetch(origin + '/storefront/' + file)).status, 404);
    for (const path of ['/storefront/../../../views/home.hbs', '/storefront/..%2f..%2f..%2fviews%2fhome.hbs']) {
      const result = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        get(origin, { path }, response => { let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk); response.on('end', () => resolve({ status: response.statusCode, body })); }).on('error', reject);
      });
      assert.equal(result.status, 404); assert.doesNotMatch(result.body, /home-hero|\{\{> site_header\}\}/);
    }
  });
});
test('home and editorial assets remain available without the retired MVC gate', async () => {
  await application(false, async origin => {
    for (const route of ['/', '/assets/storefront/home.css', '/assets/storefront/shell.css', '/storefront/hero-3d-objects.webp']) assert.equal((await fetch(origin + route)).status, 200);
    assert.equal((await fetch(origin + '/__mvc/inicio')).status, 404);
  });
});
test('home reuses catalog cards and drops repeated decorative sections', () => {
  const template = readFileSync(resolve(__dirname, '../../src/presentation/home/views/home.hbs'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../../src/presentation/catalog/public/catalog.css'), 'utf8');
  assert.match(template, /{{> catalog_card}}/); assert.doesNotMatch(template, /home-ticker|home-story|home-card-copy/);
  assert.match(css, /aspect-ratio: 1/); assert.match(css, /object-fit: contain/);
  assert.match(css, /min-width:600px/); assert.match(css, /min-width:1024px/);
  assert.match(css, /\.catalog-info-dialog\s*\{[^}]*height: fit-content/);
});

test('home restores a named editorial banner and visual brand section without changing shopping cards', async () => {
  await application(true, async origin => {
    const html = await (await fetch(origin + '/')).text();
    assert.match(html, /<section class="home-hero" aria-labelledby="home-title">/);
    assert.match(html, /<h1 id="home-title">/);
    assert.match(html, /class="home-hero-eyebrow"/);
    assert.match(html, /href="\/catalogo"[^>]*>Explorar objetos/);
    assert.match(html, /class="home-about" id="historia" aria-labelledby="home-about-title"/);
    assert.match(html, /class="home-about-art"/);
    assert.match(html, /id="home-about-title"/);
    assert.equal((html.match(/class="catalog-card"/g) ?? []).length, 1);
    assert.equal((html.match(/data-card-add/g) ?? []).length, 1);
    assert.match(html, /data-info-dialog/);
    assert.match(html, /src="\/api\/v1\/catalog\/branding\/hero"[^>]*width="1774"[^>]*height="887"[^>]*fetchpriority="high"/);
  });
});

test('home gives the banner full width while keeping collection width and mobile composition bounded', () => {
  const css = readFileSync(resolve(__dirname, '../../src/presentation/home/public/home.css'), 'utf8');
  assert.match(css, /\.home-layout\s*\{[^}]*max-width:\s*none/);
  assert.match(css, /\.home-hero-picture\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.home-catalog\s*\{[^}]*max-width:\s*1280px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /100vw/);
});

test('hero copy uses available width and lets the headline wrap naturally instead of forcing a narrow column', () => {
  const template = readFileSync(resolve(__dirname, '../../src/presentation/home/views/home.hbs'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../../src/presentation/home/public/home.css'), 'utf8');
  const heading = template.match(/<h1 id="home-title">([\s\S]*?)<\/h1>/)?.[1] ?? '';
  assert.equal(heading, 'Objetos que salen de <span>lo común.</span>');
  assert.doesNotMatch(heading, /<br/);
  assert.match(css, /\.home-hero-copy\s*\{[^}]*max-width: 38rem/);
  assert.match(css, /\.home-hero h1\s*\{[^}]*text-wrap: balance/);
  assert.match(css, /\.home-hero h1 span\s*\{[^}]*display: inline/);
  assert.match(css, /\.home-hero-description\s*\{[^}]*max-width: 46ch/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.home-hero-description\s*\{[^}]*max-width: 34ch/);
});

test('public pages allow only self-hosted fonts and fixed licensed font assets are served safely', async () => {
  await application(true, async origin => {
    for (const path of ['/', '/catalogo?currency=ARS', '/productos/florero-ondas', '/carrito']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-security-policy') ?? '', /(?:^|; )font-src 'self';/);
      assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    }
    for (const file of ['figtree-variable.woff2', 'dm-mono-regular.woff2', 'dm-mono-medium.woff2']) {
      const response = await fetch(origin + '/assets/storefront/fonts/' + file);
      assert.equal(response.status, 200, file);
      assert.match(response.headers.get('content-type') ?? '', /font\/woff2/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 0, 4), 'wOF2');
      assert.deepEqual(bytes, readFileSync(resolve(__dirname, '../../src/presentation/shell/public/fonts', file)));
    }
    for (const file of ['OFL-Figtree.txt', 'OFL-DMMono.txt']) {
      const response = await fetch(origin + '/assets/storefront/fonts/' + file);
      assert.equal(response.status, 200, file);
      assert.match(await response.text(), /SIL OPEN FONT LICENSE Version 1\.1/);
    }
    for (const file of ['README.md', '.env', 'unknown.woff2']) assert.equal((await fetch(origin + '/assets/storefront/fonts/' + file)).status, 404);
    assert.equal((await fetch(origin + '/assets/storefront/fonts/figtree-variable.woff2', { method: 'POST' })).status, 404);
    assert.equal((await fetch(origin + '/checkout')).status, 404);
  });
});
