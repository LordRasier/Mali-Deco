import { applyDecorators, BadRequestException, Controller, Get, Header, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { sessionToken, type RequestLike } from '../../modules/identity/http/http';
import { AdminPage } from './admin-page';

type Response = { status(code: number): { render(view: string, model: object): void } };
const privateHtml = () => applyDecorators(
  Header('Cache-Control', 'private, no-store'), Header('Vary', 'Cookie'), Header('X-Robots-Tag', 'noindex, nofollow'),
  Header('X-Content-Type-Options', 'nosniff'),
  Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"),
);
function noQuery(query: Record<string, unknown>) {
  if (Object.keys(query).length) throw new BadRequestException('Admin HTML accepts no query parameters');
}

@Controller('admin')
export class MvcAdminController {
  constructor(@Inject(AdminPage) private readonly page: AdminPage) {}

  @Get()
  @privateHtml()
  async show(@Req() request: RequestLike, @Query() query: Record<string, unknown>, @Res() response: Response) {
    noQuery(query);
    const result = await this.page.read(sessionToken(request));
    response.status(result.status).render('admin', result.model);
  }

  @Get('sections/:section')
  @privateHtml()
  async section(@Req() request: RequestLike, @Param('section') section: string, @Query() query: Record<string, unknown>, @Res() response: Response) {
    const result = await this.page.section(sessionToken(request), section, query);
    response.status(result.status).render(result.view, result.model);
  }
}
