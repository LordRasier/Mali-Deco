import 'reflect-metadata';
import { loadLocalEmailCredentials, emailConfig, emailReadiness } from '../src/modules/order-emails/email-config';
import { verifyEmailSender } from '../src/modules/order-emails/email-diagnostics';
import { StrictDataSource } from '../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../src/infrastructure/database/database-options';

async function main() {
  loadLocalEmailCredentials(process.env);
  const config = emailConfig();
  console.log(`Modo: ${config.mode}. Remitente: ${config.from}.`);
  const unavailable = emailReadiness(config);
  console.log(unavailable || 'Variables de envío completas. Falta validar la conexión con la API.');
  if (unavailable) process.exitCode = 1;
  const db = new StrictDataSource(databaseOptions());
  try {
    await db.initialize();
    const rows: { mode: string; status: string; total: string | number }[] = await db.query('SELECT mode, status, COUNT(*) AS total FROM order_email_outbox GROUP BY mode, status ORDER BY mode, status');
    console.log('Base de datos: cola de correos disponible.');
    if (rows.length) console.table(rows.map(row => ({ modo: row.mode, estado: row.status, cantidad: Number(row.total) })));
    else console.log('No hay correos registrados en la cola.');
    const paused = rows.filter(row => row.status === 'queued' && row.mode !== config.mode).reduce((sum, row) => sum + Number(row.total), 0);
    if (paused) console.log(`${paused} correo(s) en cola de otro modo: el proceso ${config.mode} no los enviará. No se convierten automáticamente en envíos reales.`);
  } catch (error) {
    console.error('Base de datos no disponible:', (error as { code?: string }).code || 'unknown'); process.exitCode = 1;
  } finally { if (db.isInitialized) await db.destroy(); }
  if (unavailable) return;
  const check = await verifyEmailSender(config);
  console.log(`API: ${check.message} [${check.code}]`);
  if (!check.ok) process.exitCode = 1;
}
main().catch(() => { console.error('Configuración de emails inválida. Revisar las variables documentadas.'); process.exitCode = 1; });
