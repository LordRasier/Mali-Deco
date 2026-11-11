import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createViewEngine } from '../view-engine';
import { AdminPage } from './admin-page';
import { MvcAdminController } from './admin.controller';

async function application(run: (origin: string, reads: (string | undefined)[]) => Promise<void>) {
  const reads: (string | undefined)[] = [];
  const page = new AdminPage({ me: async token => {
    reads.push(token);
    if (token === 'unavailable') throw Error('private failure');
    const role = token === 'owner' ? 'owner' : token === 'catalog' ? 'catalog' : token === 'operations' ? 'operations' : null;
    if (!role) throw new UnauthorizedException();
    return { user: { id: 'synthetic-user', email: '<script>private@example.invalid</script>', role } };
  } });
  const module = await Test.createTestingModule({ controllers: [MvcAdminController], providers: [{ provide: AdminPage, useValue: page }] }).compile();
  const app = module.createNestApplication<NestExpressApplication>({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['admin', 'admin/sections/:section'].map(path => ({ path, method: RequestMethod.GET })) });
  app.engine('hbs', createViewEngine({}).__express); app.setBaseViewsDir(join(__dirname, 'views')); app.setViewEngine('hbs');
  await app.listen(0, '127.0.0.1');
  try { await run(await app.getUrl(), reads); } finally { await app.close(); }
}

test('SSR login/shell are private, escaped and never rotate CSRF or change cookies', async () => {
  await application(async (origin, reads) => {
    for (const role of ['', 'owner', 'catalog', 'operations']) {
      const response = await fetch(`${origin}/admin`, { headers: role ? { Cookie: `store_admin=${role}` } : {} });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow'); assert.equal(response.headers.get('vary'), 'Cookie');
      assert.equal(response.headers.get('set-cookie'), null); assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
      const html = await response.text();
      assert.match(html, /data-admin-login-form/); assert.match(html, /\/assets\/admin\/generated\/admin.js/);
      assert.doesNotMatch(html, /<script>private|csrf|passwordHash|sessionToken/);
      if (role) assert.match(html, /&lt;script&gt;private@example.invalid&lt;\/script&gt;/);
      const links = [...html.matchAll(/data-admin-nav-link[^>]*href="([^"]+)"/g)].map(match => match[1]);
      assert.deepEqual(links, role === 'owner' ? ['#products', '#classifications', '#orders', '#editor', '#settings']
        : role === 'catalog' ? ['#products', '#classifications'] : role === 'operations' ? ['#orders'] : []);
    }
    assert.deepEqual(reads, [undefined, 'owner', 'catalog', 'operations']);
  });
});

test('section HTML is authenticated and role-gated on every request; no fake operational forms', async () => {
  await application(async origin => {
    for (const [role, section, status] of [
      ['', 'products', 401], ['catalog', 'orders', 403], ['operations', 'products', 403],
      ['owner', 'unknown', 404], ['owner', 'settings', 200], ['operations', 'orders', 200],
    ] as const) {
      const response = await fetch(`${origin}/admin/sections/${section}`, { headers: { Cookie: `store_admin=${role}` } });
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const html = await response.text(); assert.doesNotMatch(html, /<form|<button/);
      if (status === 200) { assert.match(html, new RegExp(`data-admin-section="${section}"`)); assert.match(html, /desarrollo/); }
    }
    assert.equal((await fetch(`${origin}/admin`, { headers: { Cookie: 'store_admin=owner; store_admin=operations' } })).status, 200);
  });
});

test('outages are not anonymous and request values cannot select views or expose prefixed/write aliases', async () => {
  await application(async origin => {
    const response = await fetch(`${origin}/admin`, { headers: { Cookie: 'store_admin=unavailable' } });
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private failure/);
    for (const query of ['layout=other', '_locals[layout]=secret', 'settings[views]=../']) {
      assert.equal((await fetch(`${origin}/admin?${query}`)).status, 400);
      assert.equal((await fetch(`${origin}/admin/sections/products?${query}`, { headers: { Cookie: 'store_admin=owner' } })).status, 400);
    }
    assert.equal((await fetch(`${origin}/api/v1/admin`)).status, 404);
    assert.equal((await fetch(`${origin}/admin`, { method: 'POST' })).status, 404);
  });
});
