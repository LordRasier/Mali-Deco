import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createViewEngine } from '../view-engine';
import { catalogCards } from './catalog-view';

async function render(cards: ReturnType<typeof catalogCards>, categories: { label: string; href: string; selected?: boolean; disabled?: boolean }[] = []) {
  const engine = createViewEngine({ seo_head: readFileSync(join(__dirname, '../seo/views/head.hbs'), 'utf8'), site_header: '', site_footer: '', cart_panel: '', catalog_filters: '', catalog_card: readFileSync(join(__dirname, 'views/partials/card.hbs'), 'utf8'), catalog_info: readFileSync(join(__dirname, 'views/partials/info.hbs'), 'utf8') });
  return new Promise<string>((accept, reject) => engine.__express(join(__dirname, 'views/catalog.hbs'), {
    layout: false, brand: 'Test', mode: 'api', cards, categories, resultLabel: `${cards.length} objetos`, page: 1, pages: 1,
    routes: { home: '/', catalog: '/catalogo', product: '/productos', cart: '/carrito' },
  }, (error, html) => error ? reject(error) : accept(html!)));
}

test('catalog has a centered introduction and equal-width outlined category choices that wrap on mobile', async () => {
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  assert.match(css, /\.catalog-intro\s*\{[^}]*flex-direction: column;[^}]*align-items: center;[^}]*text-align: center/);
  assert.match(css, /\.catalog-categories\s*\{[^}]*flex-wrap: wrap;[^}]*justify-content: center/);
  assert.match(css, /\.catalog-categories a,\.catalog-categories span\s*\{[^}]*flex: 0 0 156px;[^}]*justify-content: center;[^}]*border: 1px solid/);
  assert.match(css, /@media\(max-width:599px\)[\s\S]*\.catalog-categories a,\.catalog-categories span\s*\{[^}]*flex-basis: calc\(\(100% - \.5rem\) \/ 2\)/);
  const html = await render([], [
    { label: 'Todos', href: '/catalogo?currency=ARS' },
    { label: 'Macetas', href: '/catalogo?currency=ARS&category=macetas', selected: true },
    { label: '<Organizadores de escritorio>', href: '', disabled: true },
  ]);
  const navigation = html.match(/<nav class="catalog-categories"[\s\S]*?<\/nav>/)![0];
  assert.match(navigation, /aria-label="Categorías"/);
  assert.match(navigation, /href="\/catalogo\?currency&#x3D;ARS&amp;category&#x3D;macetas" aria-current="true">Macetas/);
  assert.match(navigation, /<span aria-disabled="true">&lt;Organizadores de escritorio&gt;<\/span>/);
});

test('catalog reuses the home banner as a decorative full-width background fading to white', async () => {
  const html = await render([]);
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  assert.match(html, /class="catalog-stage"/);
  const backdrop = html.match(/<div class="catalog-backdrop" aria-hidden="true">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.match(backdrop, /src="\/api\/v1\/catalog\/branding\/hero"/);
  assert.doesNotMatch(backdrop, /srcset=/);
  assert.match(backdrop, /alt=""/);

  assert.match(css, /\.catalog-stage\s*\{[^}]*position: relative;[^}]*isolation: isolate/);
  assert.match(css, /\.catalog-backdrop\s*\{[^}]*position: absolute;[^}]*inset: 0 0 auto;[^}]*pointer-events: none/);
  assert.match(css, /\.catalog-backdrop img\s*\{[^}]*object-fit: cover/);
  assert.match(css, /\.catalog-backdrop::after\s*\{[^}]*linear-gradient\(180deg,[^;]*#fff 100%\)/);
  assert.doesNotMatch(readFileSync(join(__dirname, '../home/views/home.hbs'), 'utf8'), /catalog-backdrop/);
});

test('public page background is white and shared cards retain a fine low-contrast dark border', () => {
  for (const path of ['../shell/public/shell.css', '../cart/public/cart.css']) {
    assert.match(readFileSync(join(__dirname, path), 'utf8'), /--paper:\s*#fff\s*;/);
  }
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  assert.match(css, /\.catalog-card\s*\{[^}]*border: 1px solid #0003/);
  assert.match(css, /\.catalog-image\s*\{[^}]*border-radius: 19px 19px 0 0/);
});

test('catalog keeps categories and one main title without a search, sort or filter toolbar', async () => {
  const cards = catalogCards([{ id: 'p', slug: 'pieza', name: 'Pieza', description: '', variants: [] }], false);
  const html = await render(cards, [{ label: 'Todos', href: '/catalogo?currency=ARS', selected: true }]);
  assert.equal((html.match(/<h1>La colección<\/h1>/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<h2>La colección<\/h2>|catalog-toolbar|mvc-search|mvc-sort|data-filter-(open|form|dialog)/);
  assert.match(html, /aria-label="Categorías"/);
  assert.match(html, /class="catalog-results-count">1 objetos<\/p>/);
  assert.match(html, /class="catalog-grid"/);
  assert.match(html, /\/productos\/pieza/);
});

test('shared catalog card keeps a no-JS link, escaped bootstrap and enhanced inline purchase', async () => {
  const cards = catalogCards([{ id: 'p', slug: 'pieza', name: '<script>Product</script>', description: '', variantCount: 1,
    variants: [{ id: 'blue', name: 'Azul', priceMinor: 123450, currency: 'ARS' }] }], false);
  const html = await render(cards);
  const article = html.match(/<article class="catalog-card"[^>]*>([\s\S]*?)<\/article>/)![1];
  assert.equal((article.match(/<a\s/g) ?? []).length, 2);
  assert.match(article, /data-card-info[^>]*aria-label="Información de &lt;script&gt;Product&lt;\/script&gt;"/);
  assert.match(article, /class="catalog-price"/); assert.match(article, /1\.234,50/);
  assert.match(article, /\/productos\/pieza\?variant&#x3D;blue/);
  assert.match(article, /&lt;script&gt;Product&lt;\/script&gt;/); assert.doesNotMatch(article, /<script>/);
  assert.match(article, /data-card-purchase hidden/); assert.match(article, /data-card-add/);
  assert.match(html, /data-info-dialog/); assert.doesNotMatch(html, /catalog-desktop-filters/);
});

test('reference card includes only a real category, above the product name', async () => {
  const product = { id: 'p', slug: 'pieza', name: 'Pieza', description: '', variants: [], variantCount: 0 };
  const html = await render(catalogCards([{ ...product, category: { id: 'c', slug: 'macetas', name: '<Macetas>' } }], false));
  assert.match(html, /class="catalog-card-category">&lt;Macetas&gt;<\/p>\s*<h3>/);
  assert.doesNotMatch(await render(catalogCards([product], false)), /class="catalog-card-category"/);
  assert.match(html, /data-price-state="prompt"/);
});

test('card description follows purchase with a divider, escaped text and an accessible full-detail fallback', async () => {
  const product = { id: 'p', slug: 'pieza', name: 'Pieza', description: 'Detalle <script>unsafe</script> & medidas.', variants: [] };
  const html = await render(catalogCards([product], false));
  const article = html.match(/<article class="catalog-card"[^>]*>([\s\S]*?)<\/article>/)![1];
  assert.ok(article.indexOf('catalog-card-summary') > article.indexOf('data-card-add'));
  assert.match(article, /class="catalog-card-description">Detalle &lt;script&gt;unsafe&lt;\/script&gt; &amp; medidas\.<\/p>/);
  assert.match(article, /data-card-more href="\/productos\/pieza" aria-label="Ver más sobre Pieza">Ver más<\/a>/);
  assert.doesNotMatch(article, /<script>/);
  assert.doesNotMatch(await render(catalogCards([{ ...product, description: ' \n ' }], false)), /catalog-card-summary|data-card-more/);
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  assert.match(css, /\.catalog-card-summary\s*\{[^}]*border-top: 1px solid/);
  assert.match(css, /\.catalog-price\[data-price-state="prompt"\],\s*\.catalog-card-description\s*\{[^}]*font: 400 14px\/1\.4 var\(--store-font\)/);
  assert.match(css, /\.catalog-card-description\s*\{[^}]*display: -webkit-box;[^}]*-webkit-box-orient: vertical;[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden/);
});

test('reference card uses a unified white surface, photo fade, accessible information link and pill actions', () => {
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  assert.match(css, /\.catalog-card\s*\{[^}]*background: var\(--card-surface\);[^}]*border-radius: 20px/);
  assert.match(css, /\.catalog-image::after\s*\{[^}]*pointer-events: none;[^}]*linear-gradient/);
  assert.match(css, /\.catalog-card-info\s*\{[^}]*width: 30px;[^}]*height: 30px/);
  assert.match(css, /\.catalog-card \.catalog-add\s*\{[^}]*border-radius: 999px;[^}]*background: var\(--blue\)/);
  assert.match(css, /\.catalog-options button\[aria-pressed="true"\]\s*\{[^}]*background: var\(--blue\);[^}]*color: var\(--on-primary\)/);
  assert.match(css, /\.catalog-price\[data-price-state="prompt"\]/);
});

test('information markup separates general content from option picking and has an outline icon close only', () => {
  const html = readFileSync(join(__dirname, 'views/partials/info.hbs'), 'utf8');
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  assert.match(html, /class="catalog-info-close"[^>]*aria-label="Cerrar información"[^>]*>\s*<svg/);
  assert.match(html, /data-info-general/);
  assert.match(html, /data-info-options hidden/);
  assert.doesNotMatch(html, /data-info-link|Ver ficha completa|Usar esta opción|>Cerrar<\/button>/);
  assert.match(css, /\.catalog-info-close\s*\{[^}]*border: 1px solid[^}]*background: transparent/);
});

test('variant controls are compact inline chips rather than full-size purchase buttons', () => {
  const css = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  const buttons = css.match(/^\.catalog-options button\s*\{([^}]+)\}/m)?.[1] ?? '';
  assert.match(buttons, /min-height: 28px/);
  assert.match(buttons, /min-width: 28px/);
  assert.match(buttons, /font-size: 12px/);
  assert.match(buttons, /line-height: 1\.4/);
  assert.match(buttons, /padding: 3px 6px/);
  assert.match(buttons, /max-width: 100%/);
  assert.doesNotMatch(css.match(/^\.catalog-choice-label\s*\{([^}]+)\}/m)?.[1] ?? '', /flex-basis: 100%/);
  assert.match(css, /\[data-card-option-kind="colors"\] \.catalog-choice-label\s*\{[^}]*flex-basis: 100%/);
  assert.match(css, /\.catalog-options select\s*\{[^}]*min-height: 32px/);
  assert.match(css, /\.catalog-options \.catalog-swatch\s*\{[^}]*width: 32px;[^}]*height: 32px/);
});

test('catalog placeholder and responsive real image keep distinct truthful presentation', async () => {
  const product = { id: 'p', slug: 'pieza', name: 'Product', description: '', variants: [] };
  const empty = await render(catalogCards([product], false));
  assert.match(empty, /class="catalog-placeholder"/); assert.match(empty, /Imagen no disponible/);
  const real = await render(catalogCards([{ ...product, primaryImage: { id: 'image', alt: '', width: 800, height: 800 } }], false));
  assert.match(real, /srcset="[^"\n]*320w[^"\n]*800w"/);
  assert.match(real, /data-card-zoom/); assert.match(real, /data-zoom-src="[^"\n]*w&#x3D;1600"/);
  assert.doesNotMatch(empty.match(/<article[\s\S]*?<\/article>/)![0], /data-card-zoom/);
  assert.match(real, /sizes="/); assert.doesNotMatch(real, /Imagen ilustrativa/);
});

test('carousel and color controls appear only for eligible real product data', async () => {
  const images = [{ id: 'i1', alt: '', width: 320, height: 320 }, { id: 'i2', alt: '', width: 320, height: 320 }];
  const colors = ['Azul', 'Coral'].map((name, i) => ({ id: `v${i}`, name, priceMinor: 100 + i, currency: 'ARS', colorInfo: { id: `c${i}`, slug: name.toLowerCase(), name, hex: i ? '#ff0000' : '#0000ff' } }));
  const base = { id: 'p', slug: 'p', name: 'Producto', description: '', images, primaryImage: images[0], variants: colors, variantCount: 2 };
  const html = await render(catalogCards([base], false));
  assert.match(html, /data-card-next/); assert.match(html, /data-card-previous/); assert.match(html, /data-card-bootstrap/);
  assert.match(html, /data-card-options/);
  assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/);
  assert.doesNotMatch(await render(catalogCards([{ ...base, variantCount: 1 }], false)), /data-card-next/);
  assert.doesNotMatch(await render(catalogCards([{ ...base, images: images.slice(0, 1) }], false)), /data-card-next/);
});

test('base modal and landing actions retain their outline beneath the filled card variant', () => {
  const catalog = readFileSync(join(__dirname, 'public/catalog.css'), 'utf8');
  const home = readFileSync(join(__dirname, '../home/public/home.css'), 'utf8');
  assert.match(catalog, /\.catalog-add\s*\{[^}]*background: transparent;[^}]*color: var\(--primary-ink\)/);
  assert.match(home, /\.home-button\s*\{[^}]*background: transparent;[^}]*color: var\(--primary-ink\);[^}]*border: 1px solid var\(--primary-ink\)/);
  assert.match(catalog, /\.catalog-add:focus-visible:not\(:disabled\)/);
  assert.match(home, /\.home-button:focus-visible/);
  assert.match(catalog, /@media\s*\(prefers-reduced-motion:reduce\)[\s\S]*\.catalog-add\s*\{\s*transition: none/);
});
