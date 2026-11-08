import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createViewEngine } from '../view-engine';
import { CheckoutPage } from './checkout-page';
import { MvcCheckoutController } from './checkout.controller';

test('compact checkout keeps touch-sized controls, themed outlines and a single mobile column', () => {
  const css = readFileSync(join(__dirname, 'public/checkout.css'), 'utf8');
  assert.match(css, /\.checkout-page h1\s*\{[^}]*font-size:\s*2rem/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.checkout-fields-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /var\(--primary-ink/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(css, /font-size:\s*clamp\(2\.7rem|box-shadow:\s*0 8px/);
});

test('all contact fields share equal column tracks rather than an asymmetric first row', () => {
  const css = readFileSync(join(__dirname, 'public/checkout.css'), 'utf8');
  const template = readFileSync(join(__dirname, 'views/checkout.hbs'), 'utf8');
  const contact = template.split('aria-labelledby="checkout-contact-title"')[1].split('</section>')[0];
  assert.equal((contact.match(/class="checkout-fields-row"/g) ?? []).length, 2);
  assert.doesNotMatch(css, /\.checkout-contact-row/);
  assert.match(css, /\.checkout-fields-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('payment actions wrap with spacing and retain the compact control typography', () => {
  const css = readFileSync(join(__dirname, 'public/checkout.css'), 'utf8');
  assert.match(css, /\[data-checkout-payment-box\]\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*8px/);
  assert.match(css, /\[data-checkout-payment-link\]\s*\{[^}]*font:\s*\.75rem[^}]*var\(--font-mono\)/);
});

test('summary uses the right-hand space for prices and removal without stacking four rows', () => {
  const css = readFileSync(join(__dirname, 'public/checkout.css'), 'utf8');
  const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split('}')[0];
  assert.match(rule('.checkout-line-info'), /grid-template-areas:\s*"name name"\s*"variant price"\s*"actions actions"/);
  assert.match(rule('.checkout-line-info'), /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(rule('.checkout-line-info strong'), /grid-area:\s*name/);
  assert.match(rule('.checkout-line-info small'), /grid-area:\s*variant/);
  assert.match(rule('.checkout-line-info > span'), /grid-area:\s*price/);
  assert.match(rule('.checkout-line-actions'), /justify-content:\s*space-between/);
  assert.match(rule('.checkout-line-actions'), /grid-area:\s*actions/);
  assert.match(rule('.checkout-quantity button'), /min-width:\s*28px/);
  assert.match(rule('.checkout-quantity button'), /min-height:\s*28px/);
  assert.match(rule('.checkout-line-actions .checkout-remove'), /min-width:\s*28px/);
  assert.match(css, /@media \(pointer: coarse\)\s*\{[^}]*min-height:\s*44px;\s*width:\s*44px/);
});

async function application(run: (origin: string, reads: unknown[][]) => Promise<void>, fail = false, enabled = true) {
  const reads: unknown[][] = [];
  const page = new CheckoutPage({ settings: async (...args: unknown[]) => { reads.push(args); if (fail) throw Error('private failure'); return { name: '<script>Brand</script>' }; } }, 'api',
    { NODE_ENV: 'development', MVC_PILOT_ENABLED: 'true', LOCAL_TEST_CHECKOUT_ENABLED: String(enabled) });
  const module = await Test.createTestingModule({ controllers: [MvcCheckoutController], providers: [{ provide: CheckoutPage, useValue: page }] }).compile();
  const app = module.createNestApplication<NestExpressApplication>({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'checkout', method: RequestMethod.GET }] });
  const partial = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
  app.engine('hbs', createViewEngine({ site_header: partial('shell/views/header.hbs'),
    site_footer: partial('shell/views/footer.hbs'), cart_panel: partial('cart/views/partials/cart-panel.hbs') }).__express);
  app.setBaseViewsDir(join(__dirname, 'views')); app.setViewEngine('hbs');
  await app.listen(0, '127.0.0.1');
  try { await run(await app.getUrl(), reads); } finally { await app.close(); }
}

test('checkout HTML is private, escaped, noncanonical and does not read or rotate checkout sessions', async () => {
  await application(async (origin, reads) => {
    const response = await fetch(`${origin}/checkout`, { headers: { Cookie: 'store_checkout=synthetic-private-cookie' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(response.headers.get('content-security-policy') ?? '', /form-action 'self'/);
    const html = await response.text(); assert.match(html, /&lt;script&gt;Brand&lt;\/script&gt;/); assert.match(html, /data-checkout-form/);
    assert.match(html, /data-cart-dialog/); assert.match(html, /data-cart-mode="api"/); assert.match(html, /data-product-base="\/productos"/);
    assert.doesNotMatch(html, /synthetic-private-cookie|csrf|canonical|<script>Brand/);
    assert.deepEqual(reads, [[]]);
    assert.match(html, /<fieldset[^>]*data-checkout-fields[^>]*disabled/);
    assert.match(html, /<form[^>]*method="dialog"[^>]*data-checkout-form/);
    assert.doesNotMatch(html, /<input[^>]*\sname="(?:email|phone|street|contact|address)"/);
  });
});
test('checkout rejects query-controlled views, POST HTML and API-prefixed aliases', async () => {
  await application(async origin => {
    for (const query of ['layout=other', '_locals[layout]=secret', 'settings[views]=../']) assert.equal((await fetch(`${origin}/checkout?${query}`)).status, 400);
    assert.equal((await fetch(`${origin}/checkout`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${origin}/api/v1/checkout`)).status, 404);
  });
});
test('checkout branding outage has no operational form and disabled route never reads settings', async () => {
  await application(async origin => {
    const response = await fetch(`${origin}/checkout`); assert.equal(response.status, 503);
    const html = await response.text(); assert.match(html, /no está disponible/); assert.doesNotMatch(html, /data-checkout-form|private failure/);
  }, true);
  await application(async (origin, reads) => { assert.equal((await fetch(`${origin}/checkout`)).status, 404); assert.deepEqual(reads, []); }, false, false);
});
