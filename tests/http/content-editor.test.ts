import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { ContentSettings } from '../../src/modules/settings/content-settings';
import { ContentDrafts } from '../../src/modules/settings/content-drafts';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { IdentityService } from '../../src/modules/identity/services/identity-service';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';
import { requestInMemory } from '../support/in-memory-http';
import { contentDatabase } from '../support/content-database';
import { pagePaths } from '../../src/modules/settings/content-config';
import { contentAt } from '../../src/presentation/admin/client/browser/content/content-state';
import { isContentSelection } from '../../src/presentation/admin/client/browser/content/content-selection';

test('authenticated preview and draft publication use real templates without exposing unpublished routes', async () => {
  const previous = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.ZIPNOVA_ENABLED = 'false'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const { db } = contentDatabase(), published = new ContentSettings(db), drafts = new ContentDrafts(published, db);
  try {
    const { applicationModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [applicationModule({ NODE_ENV: 'development' })] })
      .overrideProvider(ContentSettings).useValue(published).overrideProvider(ContentDrafts).useValue(drafts)
      .overrideProvider(PublicCatalog).useValue({ ...publicCatalogFixture, list: async (query: Record<string, unknown>) => ({ ...await publicCatalogFixture.list(), limit: Number(query.limit ?? 24), total: 53 }) }).overrideProvider(PublicFacets).useValue(publicFacetsFixture)
      .overrideProvider(IdentityService).useValue({ me: async (token: string) => {
        if (!token) throw new UnauthorizedException();
        return { user: { id: token, email: 'admin@example.test', role: token === 'owner' ? 'owner' : 'catalog' } };
      }, authorize: async (token: string, roles: string[], mutation?: { origin: string; csrf: string }) => {
        if (!token) throw new UnauthorizedException();
        if (token !== 'owner' || !roles.includes('owner') || mutation && (mutation.csrf !== 'token' || mutation.origin !== 'https://shop.example')) throw new ForbiddenException();
      } }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false }); configureHttp(app); await app.init();
    const request = (path: string, options?: Parameters<typeof requestInMemory>[2]) => requestInMemory(app!.getHttpAdapter().getInstance(), path, options);
    const endpoint = '/api/v1/admin/settings/content/editor';
    const headers = { cookie: 'store_admin=owner', origin: 'https://shop.example', 'x-csrf-token': 'token' };
    assert.equal((await request(endpoint)).status, 401);
    const settings = (await drafts.get()).settings;
    assert.equal((await request('/admin/sections/editor')).status, 401);
    assert.equal((await request('/admin/sections/editor', { headers: { cookie: 'store_admin=catalog' } })).status, 403);
    const editor = await request('/admin/sections/editor', { headers });
    assert.equal(editor.status, 200); assert.match(editor.text, /data-admin-section="editor"/); assert.match(editor.text, /content-topbar/);
    assert.match(editor.headers['content-security-policy'], /font-src 'self'/);
    const settingsSection = await request('/admin/sections/settings', { headers });
    assert.doesNotMatch(settingsSection.text, /data-content-form|settings-tab-content/);
    const visibleBody = (html: string) => html.match(/<body>([\s\S]*)<\/body>/)![1].replace(/data-editor-path="[^"]*"/g, '');
    for (const [target, path] of [['home', '/'], ['catalog', '/catalogo'], ...Object.entries(pagePaths)]) {
      const live = await request(path);
      const result = await request(`${endpoint}/preview`, { method: 'POST', headers, body: { settings, target } });
      assert.equal(result.status, 201, target);
      const rendered = JSON.parse(result.text).html;
      assert.equal(visibleBody(rendered), visibleBody(live.text), `Complete page parity: ${target}`);
      assert.match(rendered, /class="site-header"/); assert.match(rendered, /class="site-footer"/);
      assert.match(rendered, /branding\/logo/); assert.match(rendered, /theme.css/);
      assert.doesNotMatch(rendered, /<script|data-site-analytics|preview-placeholder/);
      if (target === 'catalog') assert.match(rendered, /Página 1 de 3/);
      for (const [, selection] of rendered.matchAll(/data-editor-path="([^"]*)"/g)) {
        assert.ok(isContentSelection(selection, key => contentAt(settings, key)), `Selectable field exists: ${target} / ${selection}`);
      }
      if (target === 'home') {
        for (const field of ['title', 'titleAccent', 'description', 'action', 'note', 'aboutDescription', 'aboutCaption']) assert.ok(rendered.includes(`data-editor-path="copy.home.${field}"`), field);
        assert.match(rendered, /data-editor-path="source.hero"/);
      }
      if (target === 'preguntas-frecuentes') assert.match(rendered, /data-editor-path="pages.preguntas-frecuentes.sections.\d+.questions.\d+.answer"/);
    }
    settings.pages.cuidados.enabled = false; settings.pages.cuidados.title = 'Cuidados de tus deckboxes'; settings.footer.description = 'Solo en borrador';
    settings.listing.columns = '2'; settings.listing.pageSize = '12'; settings.listing.cardPriceEnabled = false; settings.listing.itemPlural = 'productos';
    settings.copy.information.legalTitle = 'Responsable de Runica';
    const listingPreview = await request(`${endpoint}/preview`, { method: 'POST', headers, body: { settings, target: 'catalog' } });
    assert.equal(listingPreview.status, 201); assert.match(JSON.parse(listingPreview.text).html, /data-listing-columns="2"/);
    assert.match(JSON.parse(listingPreview.text).html, /data-listing-price="false"/);
    assert.match(JSON.parse(listingPreview.text).html, /Página 1 de 5/);
    assert.match((await request('/catalogo')).text, /data-listing-columns="3"/);
    const legalPreview = await request(`${endpoint}/preview`, { method: 'POST', headers, body: { settings, target: 'politica-de-privacidad' } });
    assert.equal(legalPreview.status, 201); assert.match(JSON.parse(legalPreview.text).html, /Responsable de Runica/);
    const body = { settings, revision: 0, publishedRevision: 0 };
    assert.equal((await request(`${endpoint}/draft`, { method: 'PUT', body, headers: { cookie: 'store_admin=owner' } })).status, 403);
    assert.equal((await request(`${endpoint}/preview`, { method: 'POST', body: { settings, target: 'footer' } })).status, 401);
    assert.equal((await request(`${endpoint}/draft`, { method: 'PUT', body, headers })).status, 200);
    assert.equal((await request('/cuidados')).status, 200);
    assert.doesNotMatch((await request('/')).text, /Solo en borrador|data-editor-path/);
    const preview = await request(`${endpoint}/preview`, { method: 'POST', headers, body: { settings, target: 'cuidados' } });
    assert.equal(preview.status, 201); assert.match(preview.headers['cache-control'], /private, no-store/);
    const html = JSON.parse(preview.text).html;
    assert.match(html, /Cuidados de tus deckboxes/); assert.match(html, /Solo en borrador/);
    assert.match(html, /information-layout/); assert.match(html, /data-editor-path="pages.cuidados.sections.0"/);
    assert.match(html, /script-src 'none'/); assert.doesNotMatch(html, /<script|data-site-analytics/);
    assert.equal((await request(`${endpoint}/preview`, { method: 'POST', headers, body: { settings, target: '../../admin' } })).status, 400);
    const unsafe = structuredClone(settings); unsafe.pages.cuidados.intro = '<img src=x onerror=alert(1)>';
    assert.equal((await request(`${endpoint}/preview`, { method: 'POST', headers, body: { settings: unsafe, target: 'cuidados' } })).status, 400);
    assert.equal((await request(`${endpoint}/publish`, { method: 'POST', headers, body })).status, 409);
    assert.equal((await request(`${endpoint}/publish`, { method: 'POST', headers, body: { ...body, revision: 1 } })).status, 201);
    assert.equal((await request('/cuidados')).status, 404);
    assert.match((await request('/catalogo')).text, /data-listing-columns="2"/);
    assert.match((await request('/catalogo')).text, /data-listing-price="false"/);
    assert.match((await request('/')).text, /Solo en borrador/);
    assert.doesNotMatch((await request('/')).text, /data-editor-path/);
  } finally { await app?.close(); process.env = previous; }
});
