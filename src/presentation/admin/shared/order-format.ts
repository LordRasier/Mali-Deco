import { formatPrice } from '../../catalog/shared/cart';
export function orderStatusLabel(value: string): string {
  return ({ received: 'Recibido', confirmed: 'Confirmado', completed: 'Completado', not_started: 'No iniciado', pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado', partially_refunded: 'Reembolso parcial', in_mediation: 'En disputa', refunded: 'Reembolsado', charged_back: 'Contracargo', preparing: 'En preparación', ready: 'Preparado', ready_to_ship: 'Listo para despachar', shipped: 'En camino', delivered: 'Entregado', returned: 'Devuelto' } as Record<string, string>)[value] ?? value;
}
export function orderDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
}
export function orderMoney(value: string, currency: string): string { return formatPrice(BigInt(value), currency); }
