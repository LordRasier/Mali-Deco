import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { SettingsModule } from '../settings/settings.module';
import { StoreSettings } from '../settings/store-settings';
import { EmailPreviews } from './email-previews';
import { EmailPreviewsController } from './email-previews.controller';
import { OrdersGuard } from '../orders/http/orders.guard';
import { EmailWorker } from './email-worker';

@Module({
  imports: [IdentityModule, SettingsModule], controllers: [EmailPreviewsController],
  providers: [OrdersGuard,
    { provide: EmailWorker, useFactory: (db?: DataSource) => new EmailWorker(db), inject: [{ token: DataSource, optional: true }] },
    { provide: EmailPreviews, useFactory: (settings: StoreSettings, db?: DataSource) => new EmailPreviews(settings, db, process.env.ADMIN_ORIGIN), inject: [StoreSettings, { token: DataSource, optional: true }] }],
})
export class OrderEmailsModule {}
