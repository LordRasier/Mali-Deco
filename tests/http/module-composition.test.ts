import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { StoreSettings } from '../../src/modules/settings/store-settings';
import { PostalCodeResolver } from '../../src/modules/shipping/postal/postal-code-resolver';
import { ShippingQuoteController } from '../../src/modules/shipping/quotes/catalog-quote';
import { CheckoutQuoteService } from '../../src/modules/checkout/services/quote';
import { CheckoutModule } from '../../src/modules/checkout/checkout.module';
import { ShippingModule } from '../../src/modules/shipping/shipping.module';

test('feature factories use the shared database token and preserve the postal override across consumers', async () => {
  const original = { ...process.env };
  delete process.env.DB_HOST;
  process.env.NODE_ENV = 'development';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  process.env.ZIPNOVA_ENABLED = 'false';
  const queries: string[] = [];
  const database = {
    isInitialized: true,
    query: async (sql: string) => { queries.push(sql); return sql.includes('store_name') ? [{ name: 'Synthetic store' }] : []; },
    getRepository: () => ({ findOneBy: async () => ({ storeName: 'Synthetic store' }) }),
  };
  @Global()
  @Module({ providers: [{ provide: DataSource, useValue: database }], exports: [DataSource] })
  class OfflineDatabaseModule {}
  const postal = { resolve: () => null, lookup: async () => ({ status: 'unavailable' }) };
  let module: import('@nestjs/testing').TestingModule | undefined;
  try {
    const { AppModule } = await import('../../src/app.module');
    module = await Test.createTestingModule({ imports: [OfflineDatabaseModule, AppModule, CheckoutModule] })
      .overrideProvider(PostalCodeResolver).useValue(postal).compile();
    assert.deepEqual(await module.get(PublicCatalog).settings(), { name: 'Synthetic store' });
    assert.deepEqual(await module.get(StoreSettings).get(), {
      name: 'Synthetic store', primaryColor: '#073dcc', whatsappNumber: null, instagramUsername: null,
    });
    assert.deepEqual((await module.get(PublicFacets).get()).categories, []);
    assert.ok(queries.length > 1);
    assert.equal(module.select(ShippingModule).get(PostalCodeResolver, { strict: true }), postal);
    // These are composition/lifetime assertions: both consumers must capture the same stateful resolver.
    assert.equal(Reflect.get(module.get(ShippingQuoteController), 'postal'), postal);
    assert.equal(Reflect.get(module.get(CheckoutQuoteService), 'postal'), postal);
  } finally {
    await module?.close();
    process.env = original;
  }
});
