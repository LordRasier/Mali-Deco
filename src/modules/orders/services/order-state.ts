import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export const orderStates = {
  orderStatus: ['received', 'confirmed', 'completed', 'cancelled'],
  paymentStatus: ['not_started', 'pending', 'approved', 'rejected', 'cancelled', 'partially_refunded', 'in_mediation', 'refunded', 'charged_back'],
  fulfillmentStatus: ['not_started', 'preparing', 'ready'],
  shippingStatus: ['not_started', 'ready_to_ship', 'shipped', 'delivered', 'returned'],
} as const;
export type OrderState = { [K in keyof typeof orderStates]: string };
export const statusColumns = 'order_status AS orderStatus, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, shipping_status AS shippingStatus';
export function statuses(row: OrderState): OrderState {
  for (const key of Object.keys(orderStates) as (keyof OrderState)[]) {
    if (!(orderStates[key] as readonly string[]).includes(row[key])) throw new ServiceUnavailableException('Invalid stored order status');
  }
  return { orderStatus: row.orderStatus, paymentStatus: row.paymentStatus, fulfillmentStatus: row.fulfillmentStatus, shippingStatus: row.shippingStatus };
}
export function orderId(value: string): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,36}$/.test(value)) throw new BadRequestException('Invalid order id');
  return value;
}
export function paymentCanAdvance(current: string, next: string): boolean {
  if (current === next || current === 'charged_back') return false;
  if (current === 'refunded') return next === 'charged_back';
  if (current === 'partially_refunded') return ['in_mediation', 'refunded', 'charged_back'].includes(next);
  if (current === 'approved') return ['partially_refunded', 'in_mediation', 'refunded', 'charged_back'].includes(next);
  if (current === 'in_mediation') return ['approved', 'partially_refunded', 'refunded', 'charged_back'].includes(next);
  return true;
}
