import { StoreThemeController, ContentPreviewThemeController } from './store-theme.controller';
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { StoreSettings, StoreSettingsController } from './store-settings';
import { AdminBrandAssetsController, BrandAssets, PublicBrandAssetsController } from './brand-assets';
import { SiteSettings, SiteSettingsController } from './site-settings';
import { ContentSettings, ContentSettingsController } from './content-settings';
import { ContentDrafts, ContentDraftsController } from './content-drafts';
import { ContentMedia, AdminContentMediaController, PublicContentMediaController } from './content-media';

@Module({
  imports: [IdentityModule],
  controllers: [StoreThemeController, ContentPreviewThemeController, StoreSettingsController, SiteSettingsController, ContentSettingsController, ContentDraftsController, AdminBrandAssetsController, PublicBrandAssetsController, AdminContentMediaController, PublicContentMediaController],
  providers: [
    { provide: ContentMedia, useFactory: (content: ContentSettings, db?: DataSource) => new ContentMedia(content, db), inject: [ContentSettings, { token: DataSource, optional: true }] },
    { provide: ContentDrafts, useFactory: (content: ContentSettings, db?: DataSource) => new ContentDrafts(content, db), inject: [ContentSettings, { token: DataSource, optional: true }] },
    { provide: ContentSettings, useFactory: (db?: DataSource) => new ContentSettings(db), inject: [{ token: DataSource, optional: true }] },
    { provide: SiteSettings, useFactory: (db?: DataSource) => new SiteSettings(db), inject: [{ token: DataSource, optional: true }] },
    { provide: StoreSettings, useFactory: (db?: DataSource) => new StoreSettings(db), inject: [{ token: DataSource, optional: true }] },
    { provide: BrandAssets, useFactory: (db?: DataSource) => new BrandAssets(db), inject: [{ token: DataSource, optional: true }] },
  ],
  exports: [StoreSettings, SiteSettings, ContentSettings],
})
export class SettingsModule {}
