import { StoreThemeController } from './store-theme.controller';
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { StoreSettings, StoreSettingsController } from './store-settings';
import { AdminBrandAssetsController, BrandAssets, PublicBrandAssetsController } from './brand-assets';

@Module({
  imports: [IdentityModule],
  controllers: [StoreThemeController, StoreSettingsController, AdminBrandAssetsController, PublicBrandAssetsController],
  providers: [
    { provide: StoreSettings, useFactory: (db?: DataSource) => new StoreSettings(db), inject: [{ token: DataSource, optional: true }] },
    { provide: BrandAssets, useFactory: (db?: DataSource) => new BrandAssets(db), inject: [{ token: DataSource, optional: true }] },
  ],
  exports: [StoreSettings],
})
export class SettingsModule {}
