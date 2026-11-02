import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { IdentityService } from '../identity/identity-service';
import { header, type RequestLike, sessionToken } from '../identity/http';

@Injectable()
export class OrdersGuard implements CanActivate {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const mutation = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : { origin: header(req, 'origin'), csrf: header(req, 'x-csrf-token') };
    await this.identity.authorize(sessionToken(req), ['owner', 'operations'], mutation);
    return true;
  }
}
