import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createViewEngine } from '../../src/presentation/view-engine';
import { canonicalRoutes } from '../../src/presentation/routing/storefront-routes';
import { cartCountLabel } from '../../src/presentation/shared/cart/cart';

test('cart document has one accessible shipping form and retains full escaped brand labels', async () => {
  const views = resolve(__dirname, '../../src/presentation');
  const engine = createViewEngine({
    site_header: readFileSync(resolve(views, 'shell/views/header.hbs'), 'utf8'),
    site_footer: readFileSync(resolve(views, 'shell/views/footer.hbs'), 'utf8'),
    cart_panel: readFileSync(resolve(views, 'cart/views/partials/cart-panel.hbs'), 'utf8'),
  });
  const brand = 'A very long configured brand <script>literal</script>';
  const html = await new Promise<string>((accept, reject) => engine.__express(resolve(views, 'cart/views/cart.hbs'),
    { layout: false, brand, routes: canonicalRoutes, mode: 'api', demo: false },
    (error, rendered) => error ? reject(error) : accept(rendered!)));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((html.match(/data-shipping-postal/g) ?? []).length, 1);
  assert.equal((html.match(/data-cart-content/g) ?? []).length, 1);
  assert.match(html, /aria-labelledby="cart-title"/);
  assert.match(html, /title="A very long configured brand &lt;script&gt;literal&lt;\/script&gt;"/);
  assert.match(html, /aria-label="A very long configured brand &lt;script&gt;literal&lt;\/script&gt;"/);
  assert.match(html, /data-cart-empty[\s\S]*href="\/catalogo"/);
  assert.match(html, /data-cart-open[^>]*aria-label="Abrir carrito"[^>]*aria-controls="cart-dialog"/);
  assert.match(html, /data-cart-open[^>]*>[\s\S]*?<svg[^>]*aria-hidden="true"/);
  assert.match(html, /data-cart-badge[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(html, /data-cart-filled[^>]*hidden/);
  assert.doesNotMatch(html, /data-cart-view|Ver carrito/);
  assert.equal(canonicalRoutes.cart, '/carrito');
  assert.match(html, /class="cart-summary"/);
  assert.equal(cartCountLabel(1, 1), '1 artículo · 1 unidad');
  assert.equal(cartCountLabel(2, 3), '2 artículos · 3 unidades');
});

test('shipping stays visible with cart items in both modes and postal input is compact and labeled', async () => {
  const view = resolve(__dirname, '../../src/presentation/cart/views/partials/cart-panel.hbs');
  const engine = createViewEngine({});
  for (const demo of [false, true]) {
    const html = await new Promise<string>((accept, reject) => engine.__express(view,
      { layout: false, demo, routes: canonicalRoutes }, (error, result) => error ? reject(error) : accept(result!)));
    const items = html.match(/<section class="cart-items"[\s\S]*?<\/section>/)![0];
    assert.match(items, /data-shipping-postal/);
    assert.match(items, /<section class="cart-shipping" aria-labelledby="cart-shipping-title">/);
    assert.doesNotMatch(html, /<details class="cart-shipping"/);
    assert.equal((html.match(/data-shipping-postal/g) ?? []).length, 1);
    assert.match(html, /for="mvc-postal">Código postal/);
    assert.match(html, /class="cart-postal-input"[^>]*data-shipping-postal/);
    assert.match(html, /aria-describedby="mvc-postal-error cart-shipping-message"/);
    assert.match(html, /data-cart-filled hidden/);
    assert.doesNotMatch(html, /modo de demostración|Modo demostración/);
    assert.match(html, /<dl class="cart-estimate" aria-live="polite">/);
    assert.match(html, /class="cart-postal-controls" data-shipping-controls/);
    assert.match(html, /data-shipping-retry disabled>Calcular<\/button>/);
    assert.match(html, /<fieldset[^>]*data-shipping-options[^>]*hidden>/);
    assert.match(html, /<legend class="sr-only">Medios de envío<\/legend>/);
    assert.doesNotMatch(html, /Iniciar compra|Transferencia|Gracias por tu compra/);
  }
});

test('postal input and calculate button share the full shipping width without a fixed cap', () => {
  const css = readFileSync(resolve(__dirname, '../../src/presentation/cart/public/cart.css'), 'utf8');
  const field = css.match(/\.cart-postal-field\s*\{([^}]*)\}/)![1];
  assert.match(field, /(?:^|;)\s*width:\s*100%/);
  assert.match(css, /\.cart-postal-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*3fr\) minmax\(0,\s*2fr\)/);
  assert.doesNotMatch(css, /\.cart-postal-field\s*\{[^}]*max-width:\s*16rem/);
  assert.doesNotMatch(css, /\.cart-shipping-calculate\s*\{[^}]*flex:\s*0 0 7rem/);
});
