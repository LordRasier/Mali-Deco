import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IdentityService } from '../../modules/identity/services/identity-service';
import { adminSections, isAdminSection, type AdminSection } from './shared/navigation';

type Identity = Pick<IdentityService, 'me'>;
const unavailable = 'No se pudo comprobar la sesión. Intente nuevamente.';
export interface AdminSectionRenderer {
  read(query: Record<string, unknown>): Promise<{ view: string; model: {
    layout: false; section: AdminSection; title: string; message: string; available: boolean;
  } & Record<string, unknown> }>;
}

/** HTML reads never issue or rotate CSRF; mutations continue through the existing JSON API. */
export class AdminPage {
  constructor(private readonly identity: Identity, private readonly renderers: Partial<Record<AdminSection, AdminSectionRenderer>> = {}) {}

  async read(token: string | undefined) {
    const model = { layout: false as const, authenticated: false, anonymous: false, unavailable: false,
      email: '', role: '', message: '', navigation: [] as ReturnType<typeof adminSections> };
    try {
      const { user } = await this.identity.me(token);
      return { status: 200, model: { ...model, authenticated: true, email: user.email, role: user.role, navigation: adminSections(user.role) } };
    } catch (error) {
      return error instanceof UnauthorizedException
        ? { status: 200, model: { ...model, anonymous: true } }
        : { status: 503, model: { ...model, unavailable: true, message: unavailable } };
    }
  }

  /** Explicit allowlist is the boundary for later server-rendered operational sections. */
  async section(token: string | undefined, requested: string, query: Record<string, unknown> = {}) {
    const model = { layout: false as const, section: '', title: 'Sección no disponible', available: false, message: '' };
    try {
      const { user } = await this.identity.me(token);
      if (!isAdminSection(requested)) return { status: 404, view: 'admin-section' as const, model: { ...model, message: 'El enlace no existe.' } };
      const permitted = adminSections(user.role).find(section => section.id === requested);
      if (!permitted) return { status: 403, view: 'admin-section' as const, model: { ...model, message: 'Su cuenta no tiene acceso a esta sección.' } };
      const renderer = this.renderers[requested];
      if (renderer) return { status: 200, ...await renderer.read(query) };
      if (Object.keys(query).length) throw new BadRequestException('Invalid section query');
      return { status: 200, view: 'admin-section' as const, model: { ...model, section: permitted.id, title: permitted.label,
        message: 'Esta sección MVC está en desarrollo. Sus operaciones todavía no están disponibles en esta vista.' } };
    } catch (error) {
      return { status: error instanceof UnauthorizedException ? 401 : error instanceof BadRequestException ? 400 : error instanceof NotFoundException ? 404 : 503,
        view: 'admin-section' as const, model: { ...model, message: error instanceof UnauthorizedException ? 'La sesión venció. Inicie sesión nuevamente.'
          : error instanceof BadRequestException ? 'La solicitud no es válida.' : error instanceof NotFoundException ? 'No se encontró el artículo.' : unavailable } };
    }
  }
}
