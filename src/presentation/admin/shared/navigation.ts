import type { AdminRole } from '../../../modules/identity/security/access';

export type AdminSection = 'products' | 'classifications' | 'orders' | 'settings';
const sections: ReadonlyArray<{ id: AdminSection; href: string; label: string; roles: readonly AdminRole[] }> = [
  { id: 'products', href: '#products', label: 'Productos', roles: ['owner', 'catalog'] },
  { id: 'classifications', href: '#classifications', label: 'Clasificaciones', roles: ['owner', 'catalog'] },
  { id: 'orders', href: '#orders', label: 'Pedidos', roles: ['owner', 'operations'] },
  { id: 'settings', href: '#settings', label: 'Configuración', roles: ['owner'] },
];

/** Shared by server section authorization and browser navigation; API guards remain authoritative. */
export function adminSections(role: AdminRole) { return sections.filter(section => section.roles.includes(role)); }

export function resolveAdminSection(role: AdminRole, hash: string): AdminSection | null {
  const allowed = adminSections(role);
  return (hash === '' ? allowed[0] : allowed.find(section => section.href === hash))?.id ?? null;
}

export function isAdminSection(value: string): value is AdminSection { return sections.some(section => section.id === value); }
