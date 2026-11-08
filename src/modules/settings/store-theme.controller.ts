import { Controller, Get, Inject, Res } from '@nestjs/common';
import { StoreSettings } from './store-settings';
import { themeCss } from './store-theme';

@Controller('catalog/theme.css')
export class StoreThemeController {
  constructor(@Inject(StoreSettings) private readonly settings: StoreSettings) {}
  @Get() async read(@Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    const settings = await this.settings.get();
    response.setHeader('Content-Type', 'text/css; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return themeCss(settings.primaryColor);
  }
}
