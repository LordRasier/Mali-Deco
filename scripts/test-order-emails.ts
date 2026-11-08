import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { loadLocalEmailCredentials, emailConfig, emailReadiness } from '../src/modules/order-emails/email-config';
import { emailKinds, emailLabels, exampleEmailOrder, type EmailKind } from '../src/modules/order-emails/order-email-model';
import { buildEmailMessage } from '../src/modules/order-emails/email-message';
import { EmailSendError, EnvialoSimple } from '../src/modules/order-emails/envialosimple';
import { StrictDataSource } from '../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../src/infrastructure/database/database-options';

type Receipt = { stage: EmailKind; id: string; status: string; providerId?: string; error?: string };
type Batch = { id: string; to: string; from: string; createdAt: string; items: Receipt[] };

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => !['--new-run', '--dry-run'].includes(a))) throw Error('Opciones admitidas: --new-run, --dry-run.');
  loadLocalEmailCredentials(process.env);
  const config = emailConfig();
  if (config.mode !== 'test' || emailReadiness(config)) throw Error('Se requiere ORDER_EMAIL_MODE=test, una clave API y ORDER_EMAIL_TEST_TO.');
  console.log(`Tres ejemplos ficticios: ${config.from} → ${config.testTo}.`);
  if (args.includes('--dry-run')) { console.log('Validación local correcta. No se conectó a la base ni se enviaron correos.'); return; }
  const directory = resolve('.local-tools', 'email-tests');
  const latest = join(directory, 'latest.json');
  let previous: Batch | undefined;
  try { previous = JSON.parse(readFileSync(latest, 'utf8')) as Batch; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo leer el registro de la prueba anterior. No se enviaron correos.', { cause: error }); }
  if (previous && !args.includes('--new-run')) {
    console.log(`Prueba anterior: ${previous.id}, destinatario: ${previous.to}.`);
    console.table(previous.items.map(r => ({ etapa: emailLabels[r.stage], estado: r.status, id: r.providerId || '', error: r.error || '' })));
    console.log('No se repitió ningún envío. Revisá EnvíaloSimple; --new-run solicita otros tres ejemplos.'); return;
  }
  const db = new StrictDataSource(databaseOptions());
  try {
    await db.initialize();
    await db.query('SELECT id FROM order_email_outbox LIMIT 0');
    const provider = new EnvialoSimple(config);
    const domain = config.from.split('@')[1].toLowerCase();
    if (!(await provider.domains()).some(d => d.name.toLowerCase() === domain && d.status === 'verified')) throw Error('El dominio del remitente no está verificado.');
    const batch: Batch = { id: randomUUID(), to: config.testTo, from: config.from, createdAt: new Date().toISOString(),
      items: emailKinds.map(stage => ({ stage, id: randomUUID(), status: 'prepared' })) };
    const order = { ...exampleEmailOrder, id: batch.id, createdAt: batch.createdAt, contact: { name: 'Kellian', email: config.testTo }, trackingUrl: '' };
    const messages = await Promise.all(batch.items.map(r => buildEmailMessage(db, config, r.id, r.stage, order, config.testTo)));
    mkdirSync(directory, { recursive: true });
    const save = () => {
      const content = JSON.stringify(batch, null, 2);
      writeFileSync(join(directory, batch.id + '.json'), content);
      writeFileSync(latest + '.tmp', content); renameSync(latest + '.tmp', latest);
    };
    save();
    for (let i = 0; i < batch.items.length; i++) {
      const receipt = batch.items[i]; receipt.status = 'sending'; save();
      try { receipt.providerId = await provider.send(messages[i]); }
      catch (error) {
        receipt.status = error instanceof EmailSendError && !error.uncertain ? 'failed' : 'uncertain';
        receipt.error = error instanceof EmailSendError ? error.code : 'unknown'; save();
        console.error(`${emailLabels[receipt.stage]}: ${receipt.status}. ${receipt.error}. Revisá EnvíaloSimple antes de repetir.`);
        process.exitCode = 1; break;
      }
      receipt.status = 'accepted'; save();
      try { receipt.status = (await provider.delivery(receipt.providerId)).status; save(); }
      catch { /* Accepted remains accepted; a failed GET never causes a resend. */ }
      console.log(`${emailLabels[receipt.stage]}: ${receipt.status}. ID: ${receipt.providerId}`);
    }
    console.log(`Registro privado: ${latest}`);
    console.log('Estos ejemplos no crean ni modifican pedidos. Los pedidos nuevos registran sus correos en el admin.');
  } finally { if (db.isInitialized) await db.destroy(); }
}
main().catch(error => {
  const code = (error as { code?: string }).code;
  console.error(code ? `No se pudo completar la prueba (${code}).` : error instanceof EmailSendError ? `EnvíaloSimple: ${error.code}.` : 'No se pudo completar la prueba. Revisá modo test, destinatario, base de datos, registros de prueba y dominio.');
  process.exitCode = 1;
});
