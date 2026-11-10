/** A test order does not create a payment or contact a payment provider. */
export type PaymentStartResult = { status: 'unavailable'; reason: 'disabled' };
export interface PaymentProvider { start(orderId: string): Promise<PaymentStartResult> }

export class DisabledPaymentProvider implements PaymentProvider {
  async start(): Promise<PaymentStartResult> {
    return { status: 'unavailable', reason: 'disabled' };
  }
}
