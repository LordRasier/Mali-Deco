import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { IdentityService } from '../../identity/services/identity-service';
import { header, type RequestLike, sessionToken } from '../../identity/http/http';

@Injectable()
export class OrdersGuard implements CanActivate {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const mutation = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : { origin: header(req, 'origin'), csrf: header(req, 'x-csrf-token') };
    const session = await this.identity.authorize(sessionToken(req), ['owner', 'operations'], mutation);
    (req as RequestLike & { orderActor: string }).orderActor = session.email;
    return true;
  }
}
