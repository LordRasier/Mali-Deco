import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { databaseOptions } from './database/database-options';
import { DataSource } from 'typeorm';
import { CatalogController } from './catalog/catalog.controller';
import { PublicCatalog } from './catalog/public-catalog';
import { CatalogAdmin } from './catalog/catalog-admin';
import { AdminCatalogController } from './catalog/admin.controller';
import { AuthController } from './identity/auth.controller';
import { CatalogGuard } from './identity/catalog.guard';
import { MysqlIdentityStore } from './identity/identity-store';
import { IdentityService } from './identity/identity-service';
import { allowedAdminOrigin } from './identity/origin-config';

if (!process.env.DB_HOST && process.env.NODE_ENV === 'production') {
  throw new Error('DB_HOST is required in production');
}

@Module({
  imports: process.env.DB_HOST ? [TypeOrmModule.forRoot(databaseOptions())] : [],
  controllers: [AppController, CatalogController, AuthController, AdminCatalogController],
  providers: [
    { provide: PublicCatalog, useFactory: (db?: DataSource) => new PublicCatalog(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogAdmin, useFactory: (db?: DataSource) => new CatalogAdmin(db), inject: [{ token: DataSource, optional: true }] },
    { provide: IdentityService, useFactory: (db?: DataSource) => new IdentityService(new MysqlIdentityStore(db), allowedAdminOrigin(process.env)), inject: [{ token: DataSource, optional: true }] },
    CatalogGuard,
  ],
})
export class AppModule {}
