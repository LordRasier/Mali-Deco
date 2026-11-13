import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentRegistry, isPaymentMode } from '../src/modules/payments/payment-registry';
import { loadLocalPaymentCredentials, type PaymentCredentialSource } from '../src/modules/payments/local-credentials';
import { paymentProbe } from '../src/modules/payments/payment-probe';

async function main() {
  const selected = process.argv[2] ?? 'production';
  if (!(isPaymentMode(selected) || selected === 'all') || process.argv.length > 3) { console.error('Uso: npm run payments:check -- production|test|all'); process.exitCode = 1; return; }
  let sources: PaymentCredentialSource[];
  try { sources = loadLocalPaymentCredentials(process.env); }
  catch { console.error('No se pudo cargar MERCADOPAGO_ENV_FILE. Revisá la ruta y los permisos del archivo privado.'); process.exitCode = 1; return; }
  console.log('Diagnóstico v2 · solo lecturas; no modifica ajustes ni crea pagos.');
  for (const mode of selected === 'all' ? ['production', 'test'] as const : [selected]) {
    const key = mode === 'production' ? 'MERCADOPAGO_ACCESS_TOKEN' : 'MERCADOPAGO_TEST_ACCESS_TOKEN';
    const source = sources.find(item => item.key === key)!;
    const origin = { environment: 'entorno/.env', private_file: 'MERCADOPAGO_ENV_FILE', missing: 'ausente' };
    console.table([{ modo: mode, variable: key, origen: origin[source.source], otraClaveEnArchivoIgnorada: source.privateFileConflict }]);
    if (source.privateFileConflict) console.log('Hay una clave distinta en el archivo privado, pero este proceso está usando la del entorno/.env.');
    const probe = paymentProbe();
    try {
      const result = await new PaymentRegistry(process.env, probe.request).verify(mode);
      console.table([{ modo: mode, estado: 'verificado', vendedor: result.sellerId }]);
      console.log('Se verificó la cuenta. No se modificaron ajustes ni se creó ningún pago.');
    } catch (error) {
      const body = error instanceof ServiceUnavailableException ? error.getResponse() : undefined;
      if (body && typeof body === 'object' && 'code' in body && body.code === 'PAYMENT_VERIFICATION_FAILED') {
        const detail = body as { code: string; reason: string; message: string; missing: string[]; expectedSellerId?: string; actualSellerId?: string };
        console.table([{ modo: mode, código: detail.reason, motivo: detail.message, faltantes: detail.missing.join(', '),
          vendedorConfigurado: detail.expectedSellerId ?? '', cuentaAutenticada: detail.actualSellerId ?? '' }]);
      } else console.error('No se pudo verificar la cuenta de Mercado Pago.');
      process.exitCode = 1;
    }
    if (probe.responses.length) console.table(probe.responses.map(result => ({ consulta: result.endpoint, http: result.status,
      codigoAPI: result.codes.join(', ') || (result.status >= 400 ? 'sin código reconocido' : ''), respuesta: result.body, requestId: result.requestId ?? '' })));
    if (probe.responses.some(result => result.codes.includes('PA_UNAUTHORIZED_RESULT_FROM_POLICIES'))) {
      console.log('Mercado Pago rechazó el acceso por una política. Revisá el estado de la cuenta/aplicación y consultá a Soporte con el requestId, si está disponible.');
    }
  }
}
void main().catch(() => { console.error('No se pudo completar el diagnóstico de pagos.'); process.exitCode = 1; });
