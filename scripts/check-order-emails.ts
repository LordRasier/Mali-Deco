import 'reflect-metadata';
import { loadLocalEmailCredentials, emailConfig, emailReadiness } from '../src/modules/order-emails/email-config';
import { verifyEmailSender } from '../src/modules/order-emails/email-diagnostics';
import { StrictDataSource } from '../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../src/infrastructure/database/database-options';

async function main() {
  const source = process.env.ENVIALOSIMPLE_API_KEY ? 'ENVIALOSIMPLE_API_KEY (tiene prioridad sobre el archivo)'
    : process.env.ENVIALOSIMPLE_API_KEY_FILE ? 'ENVIALOSIMPLE_API_KEY_FILE' : 'sin configurar';
  loadLocalEmailCredentials(process.env);
  const config = emailConfig();
  console.log(`Origen de la clave: ${source}.`);
  console.log(`Modo: ${config.mode}. Remitente: ${config.from}.`);
  const unavailable = emailReadiness(config);
  console.log(unavailable || 'Variables de envío completas. Falta validar la conexión con la API.');
  if (unavailable) process.exitCode = 1;
  const db = new StrictDataSource(databaseOptions());
  try {
    await db.initialize();
    const rows: { mode: string; status: string; paymentMode: string; total: string | number }[] = await db.query(`SELECT e.mode, e.status, o.payment_mode AS paymentMode, COUNT(*) AS total
      FROM order_email_outbox e JOIN checkout_orders o ON o.id = e.order_id
      GROUP BY e.mode, e.status, o.payment_mode ORDER BY e.mode, e.status, o.payment_mode`);
    console.log('Base de datos: cola de correos disponible.');
    if (rows.length) console.table(rows.map(row => ({ modo: row.mode, pedido: row.paymentMode, estado: row.status, cantidad: Number(row.total) })));
    else console.log('No hay correos registrados en la cola.');
    const testEnabled = config.mode === 'live' && !!config.testTo;
    const paused = rows.filter(row => row.status === 'queued' && row.mode !== config.mode && !(testEnabled && row.mode === 'test' && row.paymentMode === 'test')).reduce((sum, row) => sum + Number(row.total), 0);
    if (paused) console.log(`${paused} correo(s) pausados: su modo no está habilitado o falta el destinatario de pruebas.`);
    if (testEnabled) console.log(`Pedidos de prueba: se procesan también en live, únicamente hacia ${config.testTo} y con asunto [PRUEBA].`);
  } catch (error) {
    console.error('Base de datos no disponible:', (error as { code?: string }).code || 'unknown'); process.exitCode = 1;
  } finally { if (db.isInitialized) await db.destroy(); }
  if (unavailable) return;
  const check = await verifyEmailSender(config);
  console.log(`API: ${check.message} [${check.code}]`);
  if (!check.ok) process.exitCode = 1;
}
main().catch(() => { console.error('Configuración de emails inválida. Revisar las variables documentadas.'); process.exitCode = 1; });
