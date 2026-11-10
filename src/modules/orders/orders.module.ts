import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { AdminOrdersController } from './http/admin-orders.controller';
import { OrdersGuard } from './http/orders.guard';
import { OrdersService } from './services/orders.service';
import { OrderManagement } from './services/order-management';

@Module({
  imports: [IdentityModule],
  controllers: [AdminOrdersController],
  providers: [
    { provide: OrderManagement, useFactory: (db?: DataSource) => new OrderManagement(db), inject: [{ token: DataSource, optional: true }] },
    { provide: OrdersService, useFactory: (db?: DataSource) => new OrdersService(db), inject: [{ token: DataSource, optional: true }] },
    OrdersGuard,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
