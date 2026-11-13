import { Body, Controller, Header, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { TrackingService } from './tracking-service';
import { assertTrackingOrigin, trackingBody, trackingCookie, trackingCookiePath, trackingToken, type TrackingRequest } from './tracking-security';

export const TRACKING_ORIGIN = Symbol('TRACKING_ORIGIN');
type Response = { cookie(name: string, value: string, options: object): void; clearCookie(name: string, options: object): void };
@Controller('order-tracking')
export class TrackingController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService, @Inject(TRACKING_ORIGIN) private readonly origin: string) {}
  private check(req: TrackingRequest) { assertTrackingOrigin(req, this.origin); }
  private cookies() { return { httpOnly: true, secure: this.origin.startsWith('https:'), sameSite: 'strict', path: trackingCookiePath }; }
  @Post('request') @HttpCode(202) @Header('Cache-Control', 'private, no-store')
  request(@Req() req: TrackingRequest, @Body() body: unknown) {
    this.check(req); return this.tracking.requestLink(trackingBody(body, ['email']).email);
  }
  @Post('access') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  async access(@Req() req: TrackingRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    this.check(req); const input = trackingBody(body, ['token']), access = await this.tracking.access(input.token);
    res.cookie(trackingCookie, input.token as string, { ...this.cookies(), expires: new Date(Math.min(new Date(access.expiresAt).getTime(), Date.now() + 7 * 86400000)) });
    return { ok: true };
  }
  @Post('orders') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  orders(@Req() req: TrackingRequest, @Body() body: unknown) {
    this.check(req); return this.tracking.orders(trackingToken(req), trackingBody(body, ['page']).page);
  }
  @Post('logout') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  logout(@Req() req: TrackingRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    this.check(req); trackingBody(body, []); res.clearCookie(trackingCookie, this.cookies()); return { ok: true };
  }
}
