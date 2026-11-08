import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthController } from './http/auth.controller';
import { CatalogGuard } from './http/catalog.guard';
import { IdentityService } from './services/identity-service';
import { MysqlIdentityStore } from './persistence/identity-store';
import { allowedAdminOrigin } from './security/origin-config';
import { OwnerGuard } from './http/owner.guard';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: IdentityService,
      useFactory: (db?: DataSource) => new IdentityService(new MysqlIdentityStore(db), allowedAdminOrigin(process.env)),
      inject: [{ token: DataSource, optional: true }],
    },
    CatalogGuard,
    OwnerGuard,
  ],
  exports: [IdentityService, CatalogGuard, OwnerGuard],
})
export class IdentityModule {}
