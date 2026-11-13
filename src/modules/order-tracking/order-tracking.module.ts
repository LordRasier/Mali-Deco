import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TrackingService } from './tracking-service';
import { TrackingWorker } from './tracking-worker';
import { TRACKING_ORIGIN, TrackingController } from './tracking.controller';

@Module({ controllers: [TrackingController], providers: [
  { provide: TRACKING_ORIGIN, useFactory: () => process.env.NODE_ENV === 'production' ? process.env.ORDER_EMAIL_SITE_URL || '' : process.env.ADMIN_ORIGIN || process.env.ORDER_EMAIL_SITE_URL || '' },
  { provide: TrackingService, useFactory: (db?: DataSource) => new TrackingService(db), inject: [{ token: DataSource, optional: true }] },
  { provide: TrackingWorker, useFactory: (db?: DataSource) => new TrackingWorker(db), inject: [{ token: DataSource, optional: true }] },
] })
export class OrderTrackingModule {}
