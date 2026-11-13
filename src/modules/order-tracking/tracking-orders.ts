import { statuses, type OrderState } from '../orders/services/order-state';
import { publicOrderVariantName } from '../catalog/queries/public-material-labels';

export type TrackingRow = OrderState & { id: string; createdAt: Date | string; updatedAt: Date | string; currency: string; totalMinor: string;
  paymentMode: string; snapshot: string; trackingNumber: string; trackingUrl: string; paymentId?: string | null };
const labels: Record<string, string> = { received: 'Recibido', confirmed: 'Confirmado', completed: 'Completado', cancelled: 'Cancelado',
  not_started: 'No iniciado', pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', partially_refunded: 'Reembolso parcial',
  in_mediation: 'En revisión', refunded: 'Reembolsado', charged_back: 'Contracargo', preparing: 'En preparación', ready: 'Preparado',
  ready_to_ship: 'Listo para despachar', shipped: 'En camino', delivered: 'Entregado', returned: 'Devuelto' };
const text = (v: unknown, length = 200) => typeof v === 'string' ? v.slice(0, length) : '';
export function safeTrackingUrl(value: unknown) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function trackingOrder(row: TrackingRow, materials = new Map<string, string>()) {
  const state = statuses(row), snapshot = JSON.parse(row.snapshot), saved = snapshot.result;
  const exception = state.orderStatus === 'cancelled' ? 'Pedido cancelado' : state.shippingStatus === 'returned' ? 'Envío devuelto'
    : ['refunded', 'charged_back', 'partially_refunded', 'in_mediation'].includes(state.paymentStatus) ? labels[state.paymentStatus] : '';
  const reached = row.shippingStatus === 'delivered' ? 4 : ['shipped', 'returned'].includes(row.shippingStatus) ? 3
    : row.fulfillmentStatus !== 'not_started' || row.shippingStatus === 'ready_to_ship' ? 2 : row.paymentStatus === 'approved' ? 1 : 0;
  const steps = ['Pedido recibido', 'Pago confirmado', 'En preparación', 'En camino', 'Entregado'].map((label, index) => ({ label,
    state: index < reached ? 'complete' : index === reached ? (exception ? 'stopped' : 'current') : 'pending' }));
  // Explicit customer projection: no snapshot spread, internal notes, documents, provider credentials or operator events.
  return { id: row.id, reference: row.id.slice(0, 8).toUpperCase(), createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt || row.createdAt).toISOString(), currency: row.currency, totalMinor: String(row.totalMinor), test: row.paymentMode === 'test',
    status: exception || (reached === 0 ? 'Esperando el pago' : steps[reached].label), exception, steps,
    payment: labels[state.paymentStatus], paymentId: typeof row.paymentId === 'string' && /^[1-9]\d{0,15}$/.test(row.paymentId) ? row.paymentId : '',
    fulfillment: labels[state.fulfillmentStatus], shippingStatus: labels[state.shippingStatus],
    customer: text(saved.contact?.name), email: text(saved.contact?.email, 254),
    delivery: { carrier: text(saved.shipping?.carrierName), service: text(saved.shipping?.serviceName), amountMinor: String(saved.shipping?.amountMinor ?? '0'),
      address: [saved.destination?.street, saved.destination?.number, saved.destination?.unit].filter(Boolean).map(v => text(v)).join(' '),
      city: [saved.destination?.city, saved.destination?.state, saved.destination?.postalCode].filter(Boolean).map(v => text(v)).join(' · '),
      pickup: text(saved.shipping?.pickupPoint?.description, 400) },
    trackingNumber: text(row.trackingNumber, 160), trackingUrl: safeTrackingUrl(row.trackingUrl),
    lines: (saved.lines ?? []).slice(0, 100).map((line: Record<string, unknown>) => ({ name: text(line.name), variant: publicOrderVariantName(text(line.variantName), snapshot.quote?.lines ?? [], materials),
      quantity: Number(line.quantity), unitPriceMinor: String(line.unitPriceMinor), lineTotalMinor: String(line.lineTotalMinor) })),
  };
}
