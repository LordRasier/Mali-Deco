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
import { SeoCatalog } from './services/seo-catalog';
import { CategoryPresentations } from './services/category-presentation';
import { AdminCategoryPresentationController, PublicCategoryImageController } from './controllers/category-presentation.controller';

@Module({
  imports: [IdentityModule],
  controllers: [CatalogController, PublicCartController, AdminCatalogController, AdminCategoriesController, AdminMaterialsController, AdminColorsController, AdminCategoryPresentationController, PublicCategoryImageController],
  providers: [
    { provide: SeoCatalog, useFactory: (db?: DataSource) => new SeoCatalog(db), inject: [{ token: DataSource, optional: true }] },
    { provide: PublicCatalog, useFactory: (db?: DataSource) => new PublicCatalog(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CategoryPresentations, useFactory: (db?: DataSource) => new CategoryPresentations(db), inject: [{ token: DataSource, optional: true }] },
    { provide: PublicFacets, useFactory: (categories: CategoryPresentations, db?: DataSource) => new PublicFacets(db, categories), inject: [CategoryPresentations, { token: DataSource, optional: true }] },
    { provide: PublicCartResolver, useFactory: (db?: DataSource) => new PublicCartResolver(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogAdmin, useFactory: (db?: DataSource) => new CatalogAdmin(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogTaxonomy, useFactory: (categories: CategoryPresentations, db?: DataSource) => new CatalogTaxonomy(db, categories), inject: [CategoryPresentations, { token: DataSource, optional: true }] },
  ],
  exports: [PublicCatalog, PublicFacets, PublicCartResolver, CatalogAdmin, CatalogTaxonomy, SeoCatalog],
})
export class CatalogModule {}
