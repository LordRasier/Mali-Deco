import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { matchesSecret } from './security';

export type AdminRole = 'owner' | 'catalog' | 'operations';
export interface SessionAccess { role: AdminRole; expiresAt: Date; revokedAt: Date | null; disabledAt: Date | null }

export function authorize(session: SessionAccess | null, roles: AdminRole[], now = new Date()): void {
  if (!session || session.disabledAt || session.revokedAt || !Number.isFinite(session.expiresAt.getTime()) || session.expiresAt <= now) throw new UnauthorizedException();
  if (!roles.includes(session.role)) throw new ForbiddenException();
}
export function requireOrigin(origin: string | undefined, allowed: string, csrf: string | undefined, expectedHash: string): void {
  if (!allowed || origin !== allowed || !csrf || !matchesSecret(csrf, expectedHash)) throw new ForbiddenException();
}
