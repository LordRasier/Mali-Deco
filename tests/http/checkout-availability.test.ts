import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { ContentSettings } from '../../src/modules/settings/content-settings';
import { defaultContentConfig } from '../../src/modules/settings/content-config';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { SeoCatalog } from '../../src/modules/catalog/services/seo-catalog';
import { PaymentSettings, type PaymentSettingsSnapshot } from '../../src/modules/payments/payment-settings';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';
import { requestInMemory } from '../support/in-memory-http';

test('every storefront cart and footer follows live payment settings without a restart', async () => {
  const previous = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.ZIPNOVA_ENABLED = 'false';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const config = defaultContentConfig();
  config.copy.cart.orderNote = 'Pedidos por Instagram: prueba de regresión';
  config.footer.orderNoteEnabled = true; config.footer.orderNote = 'Tomamos pedidos por Instagram: prueba de regresión';
  let state: PaymentSettingsSnapshot = { enabled: true, mode: 'production', available: true, revision: 1 };
  let unavailable = false, paymentReads = 0;
  const paths = ['/', '/catalogo', '/categorias/deco', '/productos/florero-ondas', '/carrito', '/checkout', '/contacto', '/envios-y-reembolsos'];
  try {
    const { applicationModule } = await import('../../src/app.module');
    const builder = Test.createTestingModule({ imports: [applicationModule({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://store.example' })] })
      .overrideProvider(ContentSettings).useValue({ get: async () => ({ settings: config, revision: 1, available: true }) })
      .overrideProvider(PublicCatalog).useValue(publicCatalogFixture)
      .overrideProvider(PublicFacets).useValue(publicFacetsFixture)
      .overrideProvider(SeoCatalog).useValue({ category: async () => ({ slug: 'deco', name: 'Deco' }), redirect: async () => undefined })
      .overrideProvider(PaymentSettings).useValue({ get: async () => {
        paymentReads++; if (unavailable) throw Error('private settings failure'); return state;
      } });
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.init();
    const request = (path: string) => requestInMemory(app!.getHttpAdapter().getInstance(), path);
    for (const scenario of ['production', 'paused', 'test', 'unavailable', 'failure', 'resumed'] as const) {
      state = { enabled: scenario !== 'paused', mode: scenario === 'test' ? 'test' : 'production', available: scenario !== 'unavailable', revision: state.revision + 1 };
      unavailable = scenario === 'failure';
      const enabled = scenario === 'production' || scenario === 'resumed';
      for (const path of paths) {
        const response = await request(path), context = `${scenario}: ${path}`;
        assert.equal(response.status, 200, context);
        assert.equal(/href="\/checkout" data-cart-checkout/.test(response.text), enabled, context);
        assert.equal(response.text.includes('Pedidos por Instagram: prueba de regresión'), !enabled, context);
        assert.equal(response.text.includes('Tomamos pedidos por Instagram: prueba de regresión'), !enabled, context);
        assert.doesNotMatch(response.text, /private settings failure|MERCADOPAGO_ACCESS_TOKEN/);
      }
    }
    const readsBefore = paymentReads;
    assert.equal((await request('/api/v1/catalog/products')).status, 200);
    assert.equal(paymentReads, readsBefore, 'JSON catalog responses do not read payment presentation settings');
    config.features.cart = false;
    assert.doesNotMatch((await request('/')).text, /data-cart-dialog|data-cart-checkout/);
    assert.equal((await request('/checkout')).status, 404);
  } finally { await app?.close(); process.env = previous; }
});
