import 'reflect-metadata';
import { StrictDataSource } from '../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../src/infrastructure/database/database-options';
import { PaymentRegistry } from '../src/modules/payments/payment-registry';
import { loadLocalPaymentCredentials } from '../src/modules/payments/local-credentials';
import { syncPaymentReferences } from '../src/modules/payments/sync-payment-references';
import type { PaymentSyncIssue } from '../src/modules/payments/payment-diagnostics';

async function main() {
  if (process.argv.length > 2) throw Error('Unexpected arguments');
  try { loadLocalPaymentCredentials(process.env); }
  catch {
    console.error('No se pudo cargar el archivo indicado en MERCADOPAGO_ENV_FILE. Revisá la ruta y los permisos del usuario que ejecuta este comando.');
    process.exitCode = 1; return;
  }
  const db = new StrictDataSource(databaseOptions());
  try {
    await db.initialize();
    const issues: PaymentSyncIssue[] = [];
    console.log('Se usa el entorno guardado en cada pedido (test o production), independientemente del selector del admin.');
    const result = await syncPaymentReferences(db, new PaymentRegistry(), issue => issues.push(issue));
    console.table([{ revisados: result.checked, recuperados: result.recovered, omitidos: result.skipped, fallidos: result.failed }]);
    console.log('Solo se recuperan números de operación verificados. No se crean cobros, se modifican estados ni se envían correos.');
    if (result.failed) {
      const stages = { database: 'Base de datos', configuration: 'Configuración', seller: 'Verificar vendedor', payments: 'Buscar pagos', record: 'Guardar referencia' };
      console.table(issues.map(issue => ({ pedido: issue.orderId, modo: issue.mode, etapa: stages[issue.stage], código: issue.code, motivo: issue.message })));
      console.error('Revisá el diagnóstico anterior. El comando usa el entorno de cada pedido y las variables de este proceso; PM2 puede tener variables diferentes. Podés repetirlo.'); process.exitCode = 1;
    }
  } finally { if (db.isInitialized) await db.destroy(); }
}
main().catch(() => { console.error('No se pudieron recuperar las referencias de pago. Revisá la base de datos y la configuración de Mercado Pago.'); process.exitCode = 1; });
