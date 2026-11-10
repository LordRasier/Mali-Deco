import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { StoreSettings } from '../settings/store-settings';
import { emailKinds, emailLabels, emailStages, exampleEmailOrder, type EmailKind, type EmailOrder } from './order-email-model';
import { renderOrderEmail, safeEmailUrl } from './order-email-template';
import { ContentSettings } from '../settings/content-settings';

export class EmailPreviews {
  constructor(private readonly settings: Pick<StoreSettings, 'get'>, private readonly db?: DataSource, private readonly origin = 'http://127.0.0.1:3000') {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Email previews unavailable'); return this.db; }
  async preview(kind: string, query: Record<string, unknown>) {
    if (!(emailKinds as readonly string[]).includes(kind) || Object.keys(query).some(key => key !== 'orderId') || (query.orderId !== undefined && (typeof query.orderId !== 'string' || !/^[a-f\d-]{36}$/i.test(query.orderId)))) throw new BadRequestException('Invalid email preview');
    let order: EmailOrder = exampleEmailOrder;
    let note = 'Ejemplo con datos ficticios. Abrir esta vista previa no envía correos.';
    if (query.orderId) {
      const [row] = await this.database().query('SELECT snapshot, tracking_number AS trackingNumber, tracking_url AS trackingUrl FROM checkout_orders WHERE id = ?', [query.orderId]);
      if (!row) throw new NotFoundException('Order not found');
      order = { ...JSON.parse(row.snapshot).result, trackingNumber: row.trackingNumber ?? '', trackingUrl: row.trackingUrl ?? '' };
      const events = await this.database().query('SELECT detail, created_at AS createdAt FROM order_events WHERE order_id = ? ORDER BY created_at, id', [query.orderId]);
      const stage = emailStages(events).find(item => item.kind === kind)!;
      note = stage.occurredAt
        ? `Etapa registrada el ${new Date(stage.occurredAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Vista previa con los datos actuales del pedido. Consultá el resultado del envío en el detalle del pedido.`
        : 'Simulación de una etapa todavía no registrada en este pedido. Abrir esta vista no envía correos.';
    }
    const settings = await this.settings.get();
    const origin = safeEmailUrl(this.origin, true); if (!origin) throw new ServiceUnavailableException('Email preview origin unavailable');
    return renderOrderEmail(kind as EmailKind, order, { name: settings.name ?? 'Tienda', primaryColor: settings.primaryColor, siteUrl: origin, bannerUrl: new URL('/api/v1/catalog/branding/hero', origin).href }, note, (await new ContentSettings(this.db).get()).settings);
  }
  async inbox() {
    // The local inbox projects existing authoritative events: no queue, mutations, replay or external transport.
    // First transition per order/stage appears once even if a webhook is repeated or a state is revisited.
    const detail = "IF(JSON_VALID(e.detail), e.detail, '{}')";
    const transition = (field: string, target: string) => `JSON_UNQUOTE(JSON_EXTRACT(${detail}, '$.changes.${field}.to')) = '${target}' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${detail}, '$.changes.${field}.from')), '') <> '${target}'`;
    const rows = await this.database().query(`SELECT o.id, o.snapshot, m.confirmedAt, m.shippedAt, m.deliveredAt FROM checkout_orders o JOIN (
      SELECT e.order_id, MIN(CASE WHEN ${transition('paymentStatus', 'approved')} THEN e.created_at END) AS confirmedAt,
      MIN(CASE WHEN ${transition('shippingStatus', 'shipped')} THEN e.created_at END) AS shippedAt,
      MIN(CASE WHEN ${transition('shippingStatus', 'delivered')} THEN e.created_at END) AS deliveredAt
      FROM order_events e GROUP BY e.order_id
    ) m ON m.order_id = o.id WHERE m.confirmedAt IS NOT NULL OR m.shippedAt IS NOT NULL OR m.deliveredAt IS NOT NULL
    ORDER BY GREATEST(COALESCE(m.confirmedAt, '1000-01-01'), COALESCE(m.shippedAt, '1000-01-01'), COALESCE(m.deliveredAt, '1000-01-01')) DESC, o.id DESC LIMIT 50`);
    return rows.flatMap((row: { id: string; snapshot: string } & Record<string, unknown>) => {
      const order = JSON.parse(row.snapshot).result as EmailOrder;
      return emailKinds.filter(kind => row[`${kind}At`]).map(kind => ({ orderId: row.id, kind, label: emailLabels[kind], name: order.contact.name, email: order.contact.email, date: new Date(row[`${kind}At`] as string | Date).toISOString() }));
    }).sort((a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date));
  }
}
