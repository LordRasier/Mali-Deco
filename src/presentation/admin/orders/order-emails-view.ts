import type { EmailDelivery } from '../../../modules/order-emails/email-outbox';
import { emailStages, type EmailEvent } from '../../../modules/order-emails/order-email-model';
import { orderDate } from '../shared/order-format';

const statuses: Record<string, [string, string]> = {
  queued: ['En cola', 'warning'], sending: ['Enviando', 'info'], accepted: ['Aceptado', 'info'], sent: ['Enviado', 'success'],
  failed: ['Falló', 'danger'], uncertain: ['Revisar', 'warning'], unconfirmed: ['Sin confirmar', 'warning'], skipped: ['Omitido', 'neutral'],
};
const reasons: Record<string, string> = {
  test_order_in_live: 'Pedido de prueba: no se envía a clientes.', invalid_recipient: 'El destinatario no es válido para un envío real.',
  order_no_longer_eligible: 'Se canceló el pedido o el pago dejó de estar aprobado.', message_preparation_failed: 'No se pudo preparar el contenido del correo.',
  provider_response_unknown: 'La API no confirmó el resultado. Revisar EnvíaloSimple antes de reenviar.',
  provider_receipt_unknown: 'La API respondió sin un identificador reconocible. Revisar EnvíaloSimple.',
  interrupted_dispatch: 'El envío se interrumpió. Revisar EnvíaloSimple antes de reenviar.',
  delivery_confirmation_unavailable: 'Aceptado por el proveedor; no se pudo confirmar la entrega.',
  provider_rejected: 'El servidor de destino rechazó el correo.', provider_failed: 'El proveedor no pudo entregar el correo.', provider_excluded: 'El destinatario está excluido en EnvíaloSimple.',
  provider_unavailable: 'No se pudo conectar con EnvíaloSimple. El aviso sigue en cola.',
};
export function orderEmailsView(id: string, events: readonly EmailEvent[], deliveries: readonly EmailDelivery[] = []) {
  return emailStages(events).map(({ kind, label, occurredAt }) => {
    const delivery = deliveries.find(d => d.stage === kind);
    const status = delivery?.status || 'not_sent';
    const [statusLabel, statusTone] = statuses[status] || ['No enviado', occurredAt ? 'warning' : 'neutral'];
    const date = status === 'sent' || status === 'failed' || status === 'uncertain' || status === 'skipped' || status === 'unconfirmed'
      ? delivery?.sentAt || delivery?.updatedAt : delivery?.acceptedAt || delivery?.createdAt;
    const timestamp = date ? new Date(date).toISOString() : '';
    return { kind, label, deliveryStatus: status, statusLabel, statusTone, stageAt: occurredAt, stageDate: occurredAt ? orderDate(occurredAt) : '',
      deliveryAt: timestamp, deliveryDate: timestamp ? orderDate(timestamp) : '', recipient: delivery?.recipient || '', test: delivery?.mode === 'test',
      error: delivery?.errorCode ? reasons[delivery.errorCode] || 'El servicio rechazó la solicitud. Revisar la configuración y los límites de la cuenta.' : '',
      trigger: { confirmed: 'Al aprobar el pago', shipped: 'Al despachar el pedido', delivered: 'Al confirmar la entrega' }[kind],
      url: '/api/v1/admin/order-email-previews/' + kind + '?orderId=' + encodeURIComponent(id) };
  });
}
