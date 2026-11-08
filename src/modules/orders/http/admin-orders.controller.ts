import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrdersGuard } from './orders.guard';
import { OrdersService } from '../services/orders.service';
import { OrderManagement } from '../services/order-management';

@Controller('admin/orders')
@UseGuards(OrdersGuard)
export class AdminOrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService, @Inject(OrderManagement) private readonly management: OrderManagement) {}
  @Header('Cache-Control', 'private, no-store')
  @Get() list(@Query() query: Record<string, unknown>) { return this.orders.list(query); }
  @Header('Cache-Control', 'private, no-store')
  @Get(':id') detail(@Param('id') id: string) { return this.orders.detail(id); }
  @Put(':id') update(@Param('id') id: string, @Body() body: unknown, @Req() req: { orderActor: string }) { return this.management.update(id, body, req.orderActor); }
  @Post(':id/attachments') @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }))
  attach(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number; originalname: string }, @Req() req: { orderActor: string }) { return this.management.attach(id, file, req.orderActor); }
  @Get(':id/attachments/:attachmentId')
  async download(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() response: { setHeader(key: string, value: string): void; send(value: Buffer): void }) {
    const file = await this.management.download(id, attachmentId);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Disposition', `attachment; filename="comprobante"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`);
    response.send(file.content);
  }
}
