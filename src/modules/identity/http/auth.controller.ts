import { BadRequestException, Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { IdentityService } from '../services/identity-service';
import { cookieOptions, header, RequestLike, ResponseLike, sessionToken } from './http';

@Controller('auth')
export class AuthController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  @Post('login')
  async login(@Req() req: RequestLike, @Res({ passthrough: true }) res: ResponseLike, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['email', 'password'].includes(key))) throw new BadRequestException('Invalid request body');
    const input = body as Record<string, unknown>;
    const result = await this.identity.login(input.email, input.password, req.ip ?? '', header(req, 'origin'), sessionToken(req));
    res.cookie('store_admin', result.token, { ...cookieOptions(), expires: result.expires });
    return { user: result.user, csrf: result.csrf };
  }
  @Get('me')
  me(@Req() req: RequestLike) { return this.identity.me(sessionToken(req)); }
  @Post('csrf')
  csrf(@Req() req: RequestLike) { return this.identity.issueCsrf(sessionToken(req), header(req, 'origin')); }
  @Post('logout')
  async logout(@Req() req: RequestLike, @Res({ passthrough: true }) res: ResponseLike) {
    await this.identity.logout(sessionToken(req), header(req, 'origin'), header(req, 'x-csrf-token'));
    res.clearCookie('store_admin', cookieOptions());
    return { ok: true };
  }
}
