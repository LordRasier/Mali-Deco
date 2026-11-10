import { applyDecorators, BadRequestException, Controller, Get, Header, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersGuard } from '../orders/http/orders.guard';
import { EmailPreviews } from './email-previews';
import { escapeEmail as e } from './order-email-template';

const privatePreview = () => applyDecorators(
  Header('Cache-Control', 'private, no-store'), Header('Vary', 'Cookie'), Header('Content-Type', 'text/html; charset=utf-8'),
  Header('X-Robots-Tag', 'noindex, nofollow'), Header('X-Content-Type-Options', 'nosniff'), Header('Referrer-Policy', 'no-referrer'),
  Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"),
);
@Controller('admin/order-email-previews')
@UseGuards(OrdersGuard)
export class EmailPreviewsController {
  constructor(@Inject(EmailPreviews) private readonly previews: EmailPreviews) {}
  @Get(':kind')
  @privatePreview()
  async show(@Param('kind') kind: string, @Query() query: Record<string, unknown>) { return (await this.previews.preview(kind, query)).html; }
  @Get()
  @privatePreview()
  async inbox(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('Invalid email inbox query');
    const items = await this.previews.inbox();
    const rows = items.map((item: { orderId: string; kind: string; label: string; name: string; email: string; date: string }) => `<tr><td><strong>#${e(item.orderId.slice(0, 8).toUpperCase())}</strong><br>${e(item.name)}</td><td>${e(item.label)}<br><small>${e(item.email)}</small></td><td>${e(new Date(item.date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }))}</td><td><a href="/api/v1/admin/order-email-previews/${e(item.kind)}?orderId=${encodeURIComponent(item.orderId)}">Ver email</a></td></tr>`).join('');
    return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etapas y vistas previas · Mali</title><style>body{margin:0;background:#f4f5f7;color:#293241;font:14px/1.6 Arial,sans-serif}main{max-width:1150px;margin:32px auto;padding:0 20px}h1{font-size:30px;margin:18px 0 8px}a{color:#007daf}a:focus-visible{outline:3px solid #007daf;outline-offset:3px}.notice{padding:16px;background:#eaf1fb;border:1px solid #cbdaf0;border-radius:6px}.table{overflow:auto;border:1px solid #e0e4e9;border-radius:6px;background:white;margin-top:24px}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:14px 18px;border-bottom:1px solid #e0e4e9}th{background:#f9fafb;font-size:12px}small{color:#647081}footer{margin:18px 0;color:#647081}</style></head><body><main><a href="/admin#settings">← Volver a Configuración</a><h1>Etapas y vistas previas</h1><p class="notice"><strong>Esta lista muestra eventos del pedido, no comprobantes de envío.</strong><br>Consultá el estado real de cada correo en Pedidos → detalle → Emails al cliente. Las vistas previas usan los datos actuales y abrirlas no genera envíos.</p><div class="table"><table><thead><tr><th>Pedido</th><th>Email</th><th>Evento registrado</th><th>Vista previa</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Todavía no hay pagos aprobados, despachos ni entregas registrados.</td></tr>'}</tbody></table></div><footer>Se muestran las etapas de los últimos 50 pedidos con eventos. Actualizá esta página después de cambiar un estado.</footer></main></body></html>`;
  }
}
