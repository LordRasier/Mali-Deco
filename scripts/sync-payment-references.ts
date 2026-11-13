import 'reflect-metadata';
import { StrictDataSource } from '../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../src/infrastructure/database/database-options';
import { PaymentRegistry } from '../src/modules/payments/payment-registry';
import { syncPaymentReferences } from '../src/modules/payments/sync-payment-references';

async function main() {
  if (process.argv.length > 2) throw Error('Unexpected arguments');
  const db = new StrictDataSource(databaseOptions());
  try {
    await db.initialize();
    const result = await syncPaymentReferences(db, new PaymentRegistry());
    console.table([{ revisados: result.checked, recuperados: result.recovered, omitidos: result.skipped, fallidos: result.failed }]);
    console.log('Solo se recuperan números de operación verificados. No se crean cobros, se modifican estados ni se envían correos.');
    if (result.failed) { console.error('No se pudieron verificar algunos pedidos. Revisá la conexión y las credenciales de su entorno y vendedor; podés repetir el comando.'); process.exitCode = 1; }
  } finally { if (db.isInitialized) await db.destroy(); }
}
main().catch(() => { console.error('No se pudieron recuperar las referencias de pago. Revisá la base de datos y la configuración de Mercado Pago.'); process.exitCode = 1; });
