import type { EmailConfig } from '../order-emails/email-config';
import type { EmailMessage } from '../order-emails/envialosimple';
import { trackingDays } from './tracking-security';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function trackingMail(config: EmailConfig, brand: string, email: string, token: string, id: string): EmailMessage {
  const name = brand.replace(/[\r\n]/g, ' ').slice(0, 100), url = new URL('/seguimiento', config.siteUrl); url.hash = token;
  const subject = (config.mode === 'test' ? '[PRUEBA] ' : '') + 'Tus pedidos · ' + name;
  return { from: { email: config.from, name }, to: email, subject, ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    user_variables: { notification_id: id, order_id: 'customer-access', stage: 'tracking' },
    text: `Tus pedidos en ${name}\n\nAbrí este enlace privado para consultar el estado, pago y envío de tus pedidos:\n${url.href}\n\nPodés volver a usarlo durante ${trackingDays} días, también para compras nuevas con este correo. No lo compartas: permite ver tus pedidos.\n\nSi no pediste este acceso, ignorá este mensaje.`,
    html: `<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;background:#f4f4f2;font-family:Arial,sans-serif;color:#252b2a"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" style="width:100%;max-width:560px;background:#fff;border:1px solid #e3e6e1;border-radius:16px"><tr><td style="padding:36px"><p style="font-size:12px;letter-spacing:2px">${escape(name)}</p><h1 style="font-size:30px">Tus pedidos, en un lugar</h1><p style="line-height:1.7">Consultá cómo va la preparación, el pago y el envío de tus compras.</p><p style="padding:16px 0"><a href="${escape(url.href)}" style="display:inline-block;background:#263c34;color:#fff;padding:15px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Ver mis pedidos</a></p><p style="font-size:14px;line-height:1.7;color:#5c6660">Guardá este correo: el enlace se puede volver a usar durante ${trackingDays} días y también muestra las compras nuevas con esta dirección.</p><p style="font-size:13px;line-height:1.6;color:#5c6660">El enlace es privado. No lo compartas, porque permite ver tus pedidos. Si no lo solicitaste, podés ignorar este mensaje.</p></td></tr></table></td></tr></table></body></html>` };
}
