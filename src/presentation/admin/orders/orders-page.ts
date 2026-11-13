import { BadRequestException } from '@nestjs/common';
import { orderStates } from '../../../modules/orders/services/order-state';
import { orderDate, orderMoney, orderStatusLabel } from '../shared/order-format';
import { orderEmailsView } from './order-emails-view';
import type { EmailDelivery } from '../../../modules/order-emails/email-outbox';
import type { EmailMode } from '../../../modules/order-emails/email-config';

type Summary = { id: string; createdAt: string; currency: string; totalMinor: string; testLocal: boolean; orderStatus: string; paymentStatus: string; fulfillmentStatus: string; shippingStatus: string;
  contact?: { name: string; email?: string; phone?: string; document?: string }; destination?: { city: string; state?: string }; itemCount?: number };
type Detail = Summary & {
  contact: { name: string; email: string; phone: string; document?: string };
  destination: { country: string; postalCode: string; city: string; state: string; street: string; number: string; unit: string | null };
  shipping: { carrierName: string; serviceName: string; amountMinor: string; currency: string; pickupPoint: { id: number; description: string } | null };
  lines: { name: string; variantName: string; quantity: number; unitPriceMinor: string; lineTotalMinor: string; currency: string }[];
  revision?: number; managedPayment?: boolean; managementAvailable?: boolean; trackingNumber?: string; trackingUrl?: string; internalNote?: string; updatedAt?: string;
  attachments?: { id: string; name: string; size: number; createdAt: string; actor: string }[];
  events?: { id: string; source: string; actor: string; detail: string; createdAt: string }[];
  emails?: EmailDelivery[]; emailSettings?: { mode?: EmailMode; testOrdersEnabled?: boolean; label: string; notice: string };
};
type ReadOrders = {
  list(query: Record<string, unknown>): Promise<{ items: Summary[]; page: number; limit: number; total: number; stats?: { awaitingPayment: number; toPrepare: number; inTransit: number } }>;
  detail(id: string): Promise<Detail | null>;
};
const tone = (state: string) => ['approved', 'completed', 'delivered', 'ready'].includes(state) ? 'success' : ['pending', 'partially_refunded', 'preparing', 'ready_to_ship'].includes(state) ? 'warning' : ['rejected', 'in_mediation', 'charged_back', 'returned'].includes(state) ? 'danger' : ['confirmed', 'shipped'].includes(state) ? 'info' : 'neutral';
const choices = (values: readonly string[], selected: unknown) => values.map(value => ({ value, label: orderStatusLabel(value), selected: value === selected }));
const summary = (order: Summary) => ({ id: order.id, shortId: order.id.slice(0, 8).toUpperCase(), date: orderDate(order.createdAt), testLocal: order.testLocal,
  total: orderMoney(order.totalMinor, order.currency), customer: order.contact?.name || 'Sin datos', email: order.contact?.email || '', city: order.destination?.city || '', itemCount: order.itemCount,
  status: orderStatusLabel(order.orderStatus), statusTone: tone(order.orderStatus), payment: orderStatusLabel(order.paymentStatus), paymentTone: tone(order.paymentStatus),
  fulfillment: orderStatusLabel(order.fulfillmentStatus), shippingStatus: orderStatusLabel(order.shippingStatus), shippingTone: tone(order.shippingStatus) });
function history(event: NonNullable<Detail['events']>[number]) {
  let data: { reason?: string; name?: string; paymentId?: string; changes?: Record<string, { from: string; to: string }> } = {};
  try { data = JSON.parse(event.detail); } catch { /* Historical entries may have no structured changes. */ }
  const labels: Record<string, string> = { orderStatus: 'Pedido', paymentStatus: 'Pago', fulfillmentStatus: 'Preparación', shippingStatus: 'Envío', trackingNumber: 'Seguimiento', trackingUrl: 'Enlace de seguimiento', internalNote: 'Nota interna' };
  return { id: event.id, date: orderDate(event.createdAt), actor: event.actor,
    title: event.source === 'email' ? 'Email al cliente' : event.source === 'mercadopago' ? 'Pago actualizado por Mercado Pago' : event.source === 'attachment' ? 'Comprobante adjuntado' : 'Pedido actualizado',
    reason: data.reason || data.name || '', paymentId: data.paymentId,
    changes: Object.entries(data.changes ?? {}).map(([key, change]) => ({ label: labels[key] ?? key, value: key.endsWith('Status') ? orderStatusLabel(change.from) + ' → ' + orderStatusLabel(change.to) : key === 'internalNote' ? 'Nota actualizada' : change.to || 'Eliminado' })) };
}
function detail(order: Detail) {
  const shippingFlow = ['not_started', 'ready_to_ship', 'shipped', 'delivered'];
  // A return is an exception, not proof that a delivery was completed.
  const returned = order.shippingStatus === 'returned', currentStep = shippingFlow.indexOf(order.shippingStatus);
  if (returned) shippingFlow.push('returned');
  const shippingSteps = shippingFlow.map((value, index) => ({ value, label: orderStatusLabel(value), number: index + 1,
    current: value === order.shippingStatus, completed: !returned && index < currentStep,
    tone: value === order.shippingStatus ? (returned ? 'returned' : 'current') : !returned && index < currentStep ? 'complete' : 'upcoming' }));
  return { ...summary(order), shippingSteps, contactName: order.contact.name,
    customerInitials: order.contact.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—',
    attachmentCount: order.attachments?.length ?? 0, email: order.contact.email, phone: order.contact.phone, document: order.contact.document || 'No informado',
    address: [order.destination.street, order.destination.number, order.destination.unit].filter(Boolean).join(' '),
    city: order.destination.city, state: order.destination.state, postal: order.destination.postalCode, country: order.destination.country,
    carrier: order.shipping.carrierName, service: order.shipping.serviceName, shippingAmount: orderMoney(order.shipping.amountMinor, order.shipping.currency), pickup: order.shipping.pickupPoint,
    subtotal: orderMoney(order.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n).toString(), order.currency),
    revision: order.revision ?? 1, canManage: order.managementAvailable !== false, managedPayment: !!order.managedPayment, paymentValue: order.paymentStatus,
    trackingNumber: order.trackingNumber ?? '', trackingUrl: order.trackingUrl ?? '', internalNote: order.internalNote ?? '',
    updated: order.updatedAt ? orderDate(order.updatedAt) : orderDate(order.createdAt),
    orderOptions: choices(orderStates.orderStatus, order.orderStatus), paymentOptions: choices(orderStates.paymentStatus, order.paymentStatus),
    fulfillmentOptions: choices(orderStates.fulfillmentStatus, order.fulfillmentStatus), shippingOptions: choices(orderStates.shippingStatus, order.shippingStatus),
    attachments: (order.attachments ?? []).map(file => ({ ...file, date: orderDate(file.createdAt), sizeLabel: Math.max(1, Math.ceil(file.size / 1024)) + ' KB', url: '/api/v1/admin/orders/' + encodeURIComponent(order.id) + '/attachments/' + encodeURIComponent(file.id) })),
    events: (order.events ?? []).map(history),
    emailSettings: order.emailSettings || { label: 'Desactivado', notice: 'El envío de correos está desactivado.' },
    emailPreviews: orderEmailsView(order.id, order.events ?? [], order.emails, order.emailSettings?.mode, order.testLocal && order.emailSettings?.testOrdersEnabled === true),
    lines: order.lines.map(line => ({ name: line.name, variant: line.variantName, quantity: line.quantity, price: orderMoney(line.unitPriceMinor, line.currency), total: orderMoney(line.lineTotalMinor, line.currency) })) };
}

export class OrdersPage {
  constructor(private readonly orders: ReadOrders) {}
  async read(query: Record<string, unknown>) {
    const filterKeys = ['search', 'orderStatus', 'paymentStatus', 'shippingStatus', 'paymentMode'];
    if (Object.keys(query).some(key => !['view', 'page', 'id', ...filterKeys].includes(key))) throw new BadRequestException('Invalid orders view');
    const view = query.view ?? 'list', page = query.page ?? '1';
    if (!['list', 'detail'].includes(String(view)) || typeof view !== 'string' || typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)) || Number(page) > 1000000) throw new BadRequestException('Invalid orders query');
    const filters: Record<string, string> = {};
    for (const key of filterKeys) if (query[key] !== undefined) { if (typeof query[key] !== 'string') throw new BadRequestException('Invalid filter'); filters[key] = query[key]; }
    const model = { layout: false as const, section: 'orders' as const, title: 'Pedidos', message: '', available: true,
      page: Number(page), pages: 1, total: 0, previous: '', next: '', items: [] as ReturnType<typeof summary>[], order: null as ReturnType<typeof detail> | null,
      stats: { awaitingPayment: 0, toPrepare: 0, inTransit: 0 }, search: filters.search ?? '', filterQuery: new URLSearchParams(filters).toString(),
      paymentModes: [{ value: 'production', label: 'Ventas reales' }, { value: 'test', label: 'Pruebas' }, { value: 'all', label: 'Todos' }].map(m => ({ ...m, selected: m.value === (filters.paymentMode ?? 'production') })),
      orderOptions: choices(orderStates.orderStatus, filters.orderStatus), paymentOptions: choices(orderStates.paymentStatus, filters.paymentStatus), shippingOptions: choices(orderStates.shippingStatus, filters.shippingStatus) };
    if (view === 'detail') {
      if (typeof query.id !== 'string' || !/^[\x21-\x7e]{1,36}$/.test(query.id)) throw new BadRequestException('Invalid order id');
      const order = await this.orders.detail(query.id); if (!order) throw new BadRequestException('Invalid order');
      model.order = detail(order);
      return { view: 'admin-order-detail', model };
    }
    if (query.id !== undefined) throw new BadRequestException('List does not accept an order id');
    const result = await this.orders.list({ page, limit: '20', ...filters });
    model.items = result.items.map(summary); model.total = result.total; model.pages = Math.max(1, Math.ceil(result.total / 20));
    model.stats = result.stats ?? model.stats;
    model.previous = model.page > 1 ? String(model.page - 1) : ''; model.next = model.page < model.pages ? String(model.page + 1) : '';
    return { view: 'admin-orders-list', model };
  }
}
