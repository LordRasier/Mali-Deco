import { BadRequestException, Controller, Get, Header, Inject, Query, Res } from '@nestjs/common';
import { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { canonicalRoutes } from '../routing/storefront-routes';

@Controller('seguimiento')
export class TrackingPageController {
  constructor(@Inject(PublicCatalog) private readonly catalog: Pick<PublicCatalog, 'settings'>) {}
  @Get() @Header('Cache-Control', 'private, no-store') @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex, nofollow') @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async page(@Query() query: Record<string, unknown>, @Res() res: { render(view: string, model: object): void }) {
    if (Object.keys(query).length) throw new BadRequestException('Usá el enlace completo que recibiste por correo.');
    const settings = await this.catalog.settings();
    res.render('tracking', { layout: false, brand: settings.name || 'Tienda', routes: canonicalRoutes, cartDisabled: true });
  }
}
