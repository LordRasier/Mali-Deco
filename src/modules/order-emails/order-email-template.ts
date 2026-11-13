import { contentHref, defaultContentConfig, type ContentConfig } from '../settings/content-config';
import { themePalette } from '../settings/store-theme';
import { emailKinds, emailLabels, type EmailKind, type EmailOrder } from './order-email-model';
import { trackingDays } from '../order-tracking/tracking-security';

export type EmailBrand = { name: string; primaryColor: string; siteUrl: string; bannerUrl: string };
export const escapeEmail = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function safeEmailUrl(value: string, local = false): string {
  try {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:' && url.hostname === '127.0.0.1'))) return '';
    return url.href;
  } catch { return ''; }
}
export function renderOrderEmail(kind: EmailKind, order: EmailOrder, brand: EmailBrand, previewNote?: string, config: ContentConfig = defaultContentConfig(), accessUrl?: string) {
  const copy = config.copy.email;
  const paths = { confirmed: "/envios-y-reembolsos", shipped: "/contacto", delivered: "/cuidados" };
  const e = escapeEmail, content = copy[kind], palette = themePalette(brand.primaryColor);
  const site = safeEmailUrl(brand.siteUrl, true); if (!site) throw Error('Invalid email site URL');
  const href = (path: string) => { const target = contentHref(config, path); return target ? new URL(target, site).href : ""; };
  const access = safeEmailUrl(accessUrl ?? '', true);
  const privateLink = access && new URL(access).origin === new URL(site).origin && new URL(access).pathname === '/seguimiento' && /^#[a-f0-9]{64}$/.test(new URL(access).hash) ? access : '';
  const ordersUrl = privateLink || href('/seguimiento');
  const trackingNote = privateLink ? `Guardá este correo: el enlace es privado y reutilizable durante ${trackingDays} días. No lo compartas, porque permite ver tus pedidos.` : 'Ingresá el correo de esta compra para recibir tu enlace privado de seguimiento.';
  const banner = brand.bannerUrl === 'cid:mali-order-banner' ? brand.bannerUrl : safeEmailUrl(brand.bannerUrl, true), tracking = safeEmailUrl(order.trackingUrl ?? '');
  const shortId = order.id.slice(0, 8).toUpperCase();
  const subject = `${content.subject} · #${shortId} · ${brand.name}`.replace(/[\r\n]/g, ' ');
  const money = (value: string) => {
    if (!/^\d+$/.test(value) || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER) || !/^[A-Z]{3}$/.test(order.currency)) throw Error('Invalid email amount');
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: order.currency }).format(Number(value) / 100);
  };
  const subtotal = order.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n).toString();
  const address = [order.destination.street, order.destination.number, order.destination.unit].filter(Boolean).join(' ');
  const destination = `${order.destination.city}, ${order.destination.state} · CP ${order.destination.postalCode}`;
  const buttonUrl = kind === 'confirmed' && ordersUrl ? ordersUrl : kind === 'shipped' && tracking ? tracking : href(paths[kind]);
  const buttonText = kind === 'confirmed' && ordersUrl ? 'Seguir mi pedido' : kind === 'shipped' && !tracking ? 'Consultar por mi envío' : content.action;
  const step = emailKinds.indexOf(kind);
  const stages = emailKinds.map((stage, index) => `<td width="33.33%" align="center" style="padding:10px 4px;border-bottom:3px solid ${index <= step ? palette.primary : '#e4e7eb'};color:${index <= step ? palette.ink : '#707887'};font-size:11px;font-weight:${index === step ? '700' : '400'};">${index + 1}. ${e(emailLabels[stage])}</td>`).join('');
  const lines = order.lines.map(line => `<tr><td style="padding:14px 0;border-bottom:1px solid #e9ecf0;"><strong style="font-size:14px;color:#202631;">${e(line.name)}</strong><br><span style="font-size:12px;color:#667085;">${e(line.variantName)} · ${e(line.quantity)} × ${e(money(line.unitPriceMinor))}</span></td><td align="right" style="padding:14px 0 14px 12px;border-bottom:1px solid #e9ecf0;white-space:nowrap;font-size:14px;">${e(money(line.lineTotalMinor))}</td></tr>`).join('');
  const shippingBlock = `<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1px;color:#667085;">ENTREGA</p><p style="margin:0;font-size:14px;line-height:1.7;">${e(order.shipping.carrierName)} · ${e(order.shipping.serviceName)}<br>${order.shipping.pickupPoint ? e(order.shipping.pickupPoint.description) : `${e(address)}<br>${e(destination)}`}${kind !== 'confirmed' && order.trackingNumber ? `<br><strong>Seguimiento:</strong> ${e(order.trackingNumber)}` : ''}</p>`;
  const text = [`${brand.name} · ${emailLabels[kind]} · #${shortId}`, `Hola, ${order.contact.name}.`, content.intro, content.detail,
    ...order.lines.map(line => `${line.name} (${line.variantName}) · ${line.quantity} × ${money(line.unitPriceMinor)} = ${money(line.lineTotalMinor)}`),
    `Subtotal: ${money(subtotal)}`, `Envío: ${money(order.shipping.amountMinor)}`, `Total: ${money(order.totalMinor)}`,
    `${order.shipping.carrierName} · ${order.shipping.serviceName}`, order.shipping.pickupPoint?.description ?? `${address}, ${destination}`,
    ...(kind !== 'confirmed' && order.trackingNumber ? [`Seguimiento: ${order.trackingNumber}`] : []), ...(buttonUrl ? [`${buttonText}: ${buttonUrl}`] : []), ...(ordersUrl ? [`Ver mis pedidos: ${ordersUrl}`, trackingNote] : []), ...(href('/contacto') ? [`${copy.helpTitle} ${href('/contacto')}`] : []), `${copy.thanks} ${brand.name}.`].join('\n\n');
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title>
<style>@media only screen and (max-width:600px){.email-pad{padding-left:20px!important;padding-right:20px!important}.email-title{font-size:28px!important}.email-outer{padding:16px 8px!important}} a:focus-visible{outline:3px solid #293241;outline-offset:3px}</style></head>
<body style="margin:0;padding:0;background:#f2f4f7;color:#293241;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(content.intro)}</div>
${previewNote ? `<div style="padding:16px 24px;background:#eaf1fb;color:#283d60;font:13px/1.6 Arial,Helvetica,sans-serif;"><strong>VISTA PREVIA LOCAL · NO ENVIADO</strong><br>${e(previewNote)}<br><strong>Para:</strong> ${e(order.contact.email)}<br><strong>Asunto:</strong> ${e(subject)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" class="email-outer" style="padding:32px 16px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #e4e7eb;border-radius:12px;overflow:hidden;">
<tr><td class="email-pad" style="padding:24px 32px;background:${palette.strong};color:#fff;"><table role="presentation" width="100%"><tr><td style="font-size:24px;font-weight:700;letter-spacing:-.6px;">${e(brand.name)}</td><td align="right" style="font-size:11px;letter-spacing:1px;">${e(copy.tagline)}</td></tr></table></td></tr>
${banner ? `<tr><td><img src="${e(banner)}" width="640" alt="${e(copy.bannerAlt)}" style="display:block;width:100%;max-width:640px;height:auto;border:0;"></td></tr>` : ''}
<tr><td class="email-pad" style="padding:30px 32px 8px;"><p style="margin:0 0 12px;color:${palette.ink};font-size:11px;letter-spacing:1.5px;font-weight:700;">${e(emailLabels[kind].toUpperCase())} · PEDIDO #${e(shortId)}</p><h1 class="email-title" style="margin:0 0 20px;color:#202631;font-size:34px;letter-spacing:-1px;line-height:1.15;">${e(content.title)}</h1><p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Hola, ${e(order.contact.name)}.</p><p style="margin:0 0 12px;font-size:16px;line-height:1.7;">${e(content.intro)}</p><p style="margin:0;color:#667085;font-size:14px;line-height:1.75;">${e(content.detail)}</p></td></tr>
<tr><td class="email-pad" style="padding:18px 32px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stages}</tr></table></td></tr>
${ordersUrl ? `<tr><td class="email-pad" style="padding:0 32px 24px;">${kind !== 'confirmed' ? `<a href="${e(ordersUrl)}" style="color:${palette.ink};font-size:14px;font-weight:700;">Ver mis pedidos</a>` : ''}<p style="font-size:12px;color:#667085;">${e(trackingNote)}</p></td></tr>` : ''}
<tr><td class="email-pad" style="padding:0 32px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${palette.primary}" style="border-radius:6px;"><a href="${e(buttonUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 22px;color:${palette.onPrimary};font-size:14px;font-weight:700;text-decoration:none;">${e(buttonText)}</a></td></tr></table></td></tr>
<tr><td class="email-pad" style="padding:0 32px 24px;"><h2 style="font-size:18px;margin:0 0 6px;">${e(copy.itemsTitle)}</h2><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th align="left" scope="col" style="padding:10px 0;font-size:12px;color:#667085;">Artículo</th><th scope="col" align="right" style="padding:10px 0;font-size:12px;color:#667085;">Importe</th></tr></thead><tbody>${lines}</tbody></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;"><tr><td style="padding-top:16px;color:#667085;">Subtotal</td><td align="right" style="padding-top:16px;">${e(money(subtotal))}</td></tr><tr><td style="padding:8px 0;color:#667085;">Envío</td><td align="right">${e(money(order.shipping.amountMinor))}</td></tr><tr><td style="padding-top:12px;border-top:1px solid #e4e7eb;font-size:18px;font-weight:700;">Total</td><td align="right" style="padding-top:12px;border-top:1px solid #e4e7eb;font-size:20px;font-weight:700;color:${palette.ink};">${e(money(order.totalMinor))}</td></tr></table></td></tr>
<tr><td class="email-pad" style="padding:22px 32px;background:#f7f8fa;border-top:1px solid #e9ecf0;border-bottom:1px solid #e9ecf0;">${shippingBlock}</td></tr>
<tr><td class="email-pad" style="padding:26px 32px;text-align:center;"><p style="font-size:16px;font-weight:700;margin:0 0 8px;">${e(copy.helpTitle)}</p><p style="font-size:13px;line-height:1.7;color:#667085;margin:0;">${e(copy.helpDescription)} <a href="${e(href('/contacto'))}" style="color:${palette.ink};font-weight:700;">${e(copy.contactAction)}</a>.<br>${e(copy.thanks)} ${e(brand.name)}.</p></td></tr>
</table><p style="margin:20px 0 0;font-size:12px;color:#667085;line-height:1.8;">${e(brand.name)} · ${e(copy.footer)}<br><a href="${e(href('/'))}" style="color:#667085;">Visitar la tienda</a> &nbsp;·&nbsp; <a href="${e(href('/envios-y-reembolsos'))}" style="color:#667085;">Envíos y devoluciones</a></p>
</td></tr></table></body></html>`;
  const filteredHtml = html.replace(/<a\b[^>]*href=""[^>]*>[\s\S]*?<\/a>/g, "");
  return { subject, html: filteredHtml, text };
}
