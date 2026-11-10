import 'reflect-metadata';
import { loadLocalEmailCredentials, emailConfig, emailReadiness } from '../src/modules/order-emails/email-config';
import { EnvialoSimple } from '../src/modules/order-emails/envialosimple';
import { StrictDataSource } from '../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../src/infrastructure/database/database-options';

async function main() {
  loadLocalEmailCredentials(process.env);
  const config = emailConfig();
  console.log(`Modo: ${config.mode}. Remitente: ${config.from}.`);
  console.log(emailReadiness(config) || 'Configuración de envío completa.');
  const db = new StrictDataSource(databaseOptions());
  try {
    await db.initialize();
    await db.query('SELECT id FROM order_email_outbox LIMIT 0');
    console.log('Base de datos: cola de correos disponible.');
  } catch (error) {
    console.error('Base de datos no disponible:', (error as { code?: string }).code || 'unknown'); process.exitCode = 1;
  } finally { if (db.isInitialized) await db.destroy(); }
  if (!config.apiKey) { console.error('Falta la clave API.'); process.exitCode = 1; return; }
  try {
    const domains = await new EnvialoSimple(config).domains();
    const domain = domains.find(d => d.name.toLowerCase() === config.from.split('@')[1].toLowerCase());
    console.log(`Dominio en EnvíaloSimple: ${domain?.status || 'no autorizado'}.`);
    if (domain?.status !== 'verified') process.exitCode = 1;
  } catch { console.error('No se pudo validar la clave/dominio con la API de EnvíaloSimple.'); process.exitCode = 1; }
}
main().catch(() => { console.error('Configuración de emails inválida. Revisar las variables documentadas.'); process.exitCode = 1; });
