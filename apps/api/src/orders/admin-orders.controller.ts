import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersGuard } from './orders.guard';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@UseGuards(OrdersGuard)
export class AdminOrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}
  @Get() list(@Query() query: Record<string, unknown>) { return this.orders.list(query); }
  @Get(':id') detail(@Param('id') id: string) { return this.orders.detail(id); }
}
