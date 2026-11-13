import { PaymentProviderError, PaymentSellerError } from './mercadopago';
import type { PaymentMode } from './payment-registry';

export type PaymentSyncStage = 'database' | 'configuration' | 'seller' | 'payments' | 'record';
export type PaymentSyncIssue = { orderId: string; mode: PaymentMode | 'unknown'; stage: PaymentSyncStage; code: string; message: string };
const known: Record<string, [string, string]> = {
  'Payment configuration incomplete': ['configuration_incomplete', 'La configuración de este entorno está incompleta o tiene un formato inválido.'],
  'Configured seller mismatch': ['seller_mismatch', 'El vendedor configurado no coincide con el guardado en el pedido.'],
  'Seller environment verification failed': ['seller_verification_failed', 'La cuenta autenticada no coincide con el vendedor, país o entorno del pedido.'],
  'Incomplete payment search': ['payment_search_incomplete', 'Mercado Pago devolvió una búsqueda incompleta o con formato inesperado.'],
  'Untrusted payment': ['payment_identity_mismatch', 'Un pago no coincide con el vendedor, entorno, pedido o moneda esperados.'],
  'Invalid payment amount': ['payment_amount_invalid', 'El importe del pedido o de la respuesta no tiene un formato válido.'],
  'Payment amount mismatch': ['payment_amount_mismatch', 'El importe de Mercado Pago no coincide con el total guardado en el pedido.'],
  'Unknown payment status': ['payment_status_unknown', 'Mercado Pago devolvió un estado no reconocido.'],
  'Multiple monetary outcomes': ['multiple_payments', 'Hay más de un pago con resultado monetario; requiere revisión antes de elegir un número.'],
};
/** Only fixed descriptions and allowlisted codes; never forward tokens, SQL or upstream bodies. */
export function paymentFailure(error: unknown, stage: PaymentSyncStage): Pick<PaymentSyncIssue, 'code' | 'message'> {
  if (error instanceof PaymentSellerError) {
    const messages = { seller_id_mismatch: 'El ID de vendedor configurado no coincide con la cuenta autenticada. Usá el ID de usuario, no el de la aplicación.',
      seller_environment_mismatch: 'La credencial pertenece a un tipo de cuenta distinto del entorno seleccionado (prueba o producción).',
      seller_country_mismatch: 'La cuenta autenticada no corresponde a Argentina (MLA).' };
    return { code: error.code, message: messages[error.code] };
  }
  if (error instanceof PaymentProviderError) {
    if (error.code === 'http_error') {
      const status = error.httpStatus;
      const detail = status === 401 ? 'La API rechazó la autenticación.' : status === 403 ? 'La API rechazó el acceso a este recurso.'
        : status === 404 ? 'La API no encontró el recurso solicitado.' : status === 429 ? 'La API limitó temporalmente las consultas.' : 'La API no pudo completar la consulta.';
      return { code: `provider_http_${status}`, message: `HTTP ${status}. ${detail}` };
    }
    return { code: `provider_${error.code}`, message: error.code === 'connection_failed'
      ? 'No se pudo conectar con Mercado Pago o venció el tiempo de espera.' : 'Mercado Pago no devolvió una respuesta JSON válida.' };
  }
  if (error instanceof Error && Object.hasOwn(known, error.message)) {
    const [code, message] = known[error.message]; return { code, message };
  }
  if (stage === 'database' || stage === 'record') {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    const allowed = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ECONNREFUSED', 'ETIMEDOUT'];
    return { code: typeof code === 'string' && allowed.includes(code) ? code : 'database_error', message: 'No se pudo leer o registrar la referencia en la base de datos.' };
  }
  return { code: 'verification_failed', message: 'No se pudo completar la verificación en esta etapa.' };
}
