import { readFileSync } from 'node:fs';

type Env = Record<string, string | undefined>;
export type EmailMode = 'disabled' | 'test' | 'live';
export type EmailConfig = { mode: EmailMode; apiKey: string; from: string; replyTo: string; testTo: string; siteUrl: string };
export function validEmail(value: string) {
  return value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value);
}
export function emailConfig(env: Env = process.env): EmailConfig {
  const mode = env.ORDER_EMAIL_MODE || 'disabled';
  if (!['disabled', 'test', 'live'].includes(mode)) throw Error('Invalid ORDER_EMAIL_MODE');
  const from = env.ORDER_EMAIL_FROM || '', replyTo = env.ORDER_EMAIL_REPLY_TO || '', testTo = env.ORDER_EMAIL_TEST_TO || '';
  if ((from && !validEmail(from)) || (replyTo && !validEmail(replyTo)) || (testTo && !validEmail(testTo))) throw Error('Invalid order email address configuration');
  const site = env.ORDER_EMAIL_SITE_URL ? new URL(env.ORDER_EMAIL_SITE_URL) : undefined;
  if (site && (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/')) throw Error('ORDER_EMAIL_SITE_URL must be a public HTTPS origin');
  const apiKey = (env.ENVIALOSIMPLE_API_KEY || '').trim();
  if (/\s/.test(apiKey)) throw Error('Invalid ENVIALOSIMPLE_API_KEY');
  return { mode: mode as EmailMode, apiKey, from, replyTo, testTo, siteUrl: site?.origin ?? '' };
}
export function loadLocalEmailCredentials(env: Env) {
  if (env.NODE_ENV !== 'development' || !env.ENVIALOSIMPLE_API_KEY_FILE || env.ENVIALOSIMPLE_API_KEY) return;
  const key = readFileSync(env.ENVIALOSIMPLE_API_KEY_FILE, 'utf8').trim();
  if (!key || /\s/.test(key)) throw Error('Invalid EnvíaloSimple API key file');
  env.ENVIALOSIMPLE_API_KEY = key;
}
export function emailReadiness(config = emailConfig()) {
  if (config.mode === 'disabled') return 'Envío desactivado';
  if (!config.apiKey) return 'Falta configurar la clave API';
  if (config.mode === 'test' && !config.testTo) return 'Falta indicar el email de prueba';
  if (!config.from || !config.siteUrl) return 'Falta configurar remitente y dominio de esta tienda';
  return '';
}
export function publicEmailConfig(config = emailConfig()) {
  const unavailable = emailReadiness(config);
  return { mode: config.mode, label: config.mode === 'test' ? 'Pruebas' : config.mode === 'live' ? 'EnvíaloSimple' : 'Desactivado',
    notice: unavailable ? unavailable + '.' : (config.mode === 'test' ? `Los correos de prueba se envían a ${config.testTo}.` : `Envíos automáticos desde ${config.from}.`), from: config.from };
}
