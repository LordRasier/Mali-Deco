import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { CatalogController } from './controllers/catalog.controller';
import { PublicCatalog } from './services/public-catalog';
import { PublicFacets } from './services/public-facets';
import { PublicCartController, PublicCartResolver } from './cart/cart-resolver';
import { CatalogAdmin } from './services/catalog-admin';
import { AdminCatalogController } from './controllers/admin.controller';
import { AdminCategoriesController, AdminMaterialsController, AdminColorsController } from './controllers/admin-taxonomy.controller';
import { CatalogTaxonomy } from './services/catalog-taxonomy';

@Module({
  imports: [IdentityModule],
  controllers: [CatalogController, PublicCartController, AdminCatalogController, AdminCategoriesController, AdminMaterialsController, AdminColorsController],
  providers: [
    { provide: PublicCatalog, useFactory: (db?: DataSource) => new PublicCatalog(db), inject: [{ token: DataSource, optional: true }] },
    { provide: PublicFacets, useFactory: (db?: DataSource) => new PublicFacets(db), inject: [{ token: DataSource, optional: true }] },
    { provide: PublicCartResolver, useFactory: (db?: DataSource) => new PublicCartResolver(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogAdmin, useFactory: (db?: DataSource) => new CatalogAdmin(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogTaxonomy, useFactory: (db?: DataSource) => new CatalogTaxonomy(db), inject: [{ token: DataSource, optional: true }] },
  ],
  exports: [PublicCatalog, PublicFacets, CatalogAdmin, CatalogTaxonomy],
})
export class CatalogModule {}
