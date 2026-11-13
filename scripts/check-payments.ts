import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentRegistry, isPaymentMode } from '../src/modules/payments/payment-registry';
import { loadLocalPaymentCredentials } from '../src/modules/payments/local-credentials';

async function main() {
  const mode = process.argv[2] ?? 'production';
  if (!isPaymentMode(mode) || process.argv.length > 3) { console.error('Uso: npm run payments:check -- production|test'); process.exitCode = 1; return; }
  try { loadLocalPaymentCredentials(process.env); }
  catch { console.error('No se pudo cargar MERCADOPAGO_ENV_FILE. Revisá la ruta y los permisos del archivo privado.'); process.exitCode = 1; return; }
  try {
    const result = await new PaymentRegistry().verify(mode);
    console.table([{ modo: mode, estado: 'verificado', vendedor: result.sellerId }]);
    console.log('Se verificó la cuenta. No se modificaron ajustes ni se creó ningún pago.');
  } catch (error) {
    const body = error instanceof ServiceUnavailableException ? error.getResponse() : undefined;
    if (body && typeof body === 'object' && 'code' in body && body.code === 'PAYMENT_VERIFICATION_FAILED') {
      const detail = body as { reason: string; message: string; missing: string[]; expectedSellerId?: string; actualSellerId?: string };
      console.table([{ modo: mode, código: detail.reason, motivo: detail.message, faltantes: detail.missing.join(', '),
        vendedorConfigurado: detail.expectedSellerId ?? '', cuentaAutenticada: detail.actualSellerId ?? '' }]);
    } else console.error('No se pudo verificar la cuenta de Mercado Pago.');
    process.exitCode = 1;
  }
}
void main().catch(() => { console.error('No se pudo completar el diagnóstico de pagos.'); process.exitCode = 1; });
