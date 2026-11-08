import { BadRequestException } from '@nestjs/common';
import type { StoreSettings } from '../../../modules/settings/store-settings';
import { publicEmailConfig } from '../../../modules/order-emails/email-config';

/** Called only after the administrative section's owner authorization. */
export class SettingsPage {
  constructor(private readonly settings: Pick<StoreSettings, 'get'>) {}
  async read(query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('Settings HTML accepts no query parameters');
    const settings = await this.settings.get();
    return { view: 'admin-settings', model: { layout: false as const, section: 'settings' as const, title: 'Configuración', message: '', available: true, name: settings.name ?? '', primaryColor: settings.primaryColor,
      whatsappNumber: settings.whatsappNumber ?? '', instagramUsername: settings.instagramUsername ?? '', emailSettings: publicEmailConfig(),
      socialLinksAvailable: Object.hasOwn(settings, 'whatsappNumber') && Object.hasOwn(settings, 'instagramUsername') } };
  }
}
