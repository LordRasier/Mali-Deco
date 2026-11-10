import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { BrandAssets } from '../settings/brand-assets';
import { StoreSettings } from '../settings/store-settings';
import type { EmailConfig } from './email-config';
import type { EmailKind, EmailOrder } from './order-email-model';
import { renderOrderEmail } from './order-email-template';
import type { EmailMessage } from './envialosimple';
import { ContentSettings } from '../settings/content-settings';

export async function buildEmailMessage(db: DataSource, config: EmailConfig, id: string, stage: EmailKind, order: EmailOrder, recipient: string): Promise<EmailMessage> {
  const settings = await new StoreSettings(db).get();
  const source = await new BrandAssets(db).read('hero') ?? await readFile(join(__dirname, '../../presentation/home/public/generated/storefront/hero-3d-objects.webp'));
  // CID JPEG works in actual inboxes without exposing localhost or depending on WebP support.
  const banner = await sharp(source, { limitInputPixels: 24000000 }).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const name = (settings.name || 'Tienda').replace(/[\r\n]/g, ' ').slice(0, 100);
  const configured = (await new ContentSettings(db).get()).settings;
  const content = renderOrderEmail(stage, order, { name, primaryColor: settings.primaryColor, siteUrl: config.siteUrl, bannerUrl: 'cid:mali-order-banner' }, undefined, configured);
  return { from: { email: config.from, name }, to: recipient, ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    ...content, subject: (config.mode === 'test' ? '[PRUEBA] ' : '') + content.subject,
    user_variables: { notification_id: id, order_id: order.id, stage },
    attachments: [{ disposition: 'inline', id: 'mali-order-banner', filename: 'mali-banner.jpg', content: banner.toString('base64') }] };
}
