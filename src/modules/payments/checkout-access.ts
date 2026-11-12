import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { sessionToken, type RequestLike } from '../identity/http/http';
import type { IdentityService } from '../identity/services/identity-service';
import { PaymentRegistry, type PaymentMode } from './payment-registry';
import type { PaymentSettings } from './payment-settings';

/** A checkout CSRF token is required separately by SessionService on every mutation. */
export class CheckoutAccess {
  constructor(private readonly settings: Pick<PaymentSettings, 'get'>, private readonly registry: PaymentRegistry, private readonly identity: Pick<IdentityService, 'authorize'>) {}
  async existing(mode: PaymentMode, req: Pick<RequestLike, 'headers'>) {
    if (mode === 'test') {
      try { await this.identity.authorize(sessionToken({ headers: req.headers, method: 'GET' }), ['owner']); }
      catch { throw new ForbiddenException('El checkout de prueba requiere la sesión del propietario.'); }
    }
  }
  async current(req: Pick<RequestLike, 'headers'>) {
    const state = await this.settings.get();
    if (!state.available || !state.enabled) throw new ServiceUnavailableException('Los nuevos pagos están desactivados.');
    await this.existing(state.mode, req);
    const provider = this.registry.get(state.mode);
    return { mode: state.mode, sellerId: provider.sellerId, revision: state.revision };
  }
}
