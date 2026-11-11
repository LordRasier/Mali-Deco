import { BadRequestException, Controller, Get, Header, Inject, Query, Res, UseGuards } from '@nestjs/common';
import { StoreSettings } from './store-settings';
import { themeCss } from './store-theme';
import { ContentSettings } from './content-settings';
import { appearanceCss, appearanceSheet, parseAppearanceSheet } from './content-appearance';
import { OwnerGuard } from '../identity/http/owner.guard';

@Controller('catalog/theme.css')
export class StoreThemeController {
  constructor(@Inject(StoreSettings) private readonly settings: StoreSettings, @Inject(ContentSettings) private readonly content: ContentSettings) {}
  @Get() async read(@Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    const settings = await this.settings.get();
    response.setHeader('Content-Type', 'text/css; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return themeCss(settings.primaryColor) + appearanceCss(appearanceSheet((await this.content.get()).settings));
  }
}

@Controller('admin/settings/content/editor/appearance.css')
@UseGuards(OwnerGuard)
export class ContentPreviewThemeController {
  constructor(@Inject(StoreSettings) private readonly settings: StoreSettings) {}
  @Get()
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async read(@Query('design') design: unknown) {
    let css: string;
    try { css = appearanceCss(parseAppearanceSheet(design)); }
    catch { throw new BadRequestException('Apariencia inválida.'); }
    return themeCss((await this.settings.get()).primaryColor) + css;
  }
}
