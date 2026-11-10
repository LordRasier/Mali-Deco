# Identidad y permisos

[Volver a módulos](../README.md)

[IdentityModule](identity.module.ts) es dueño de IdentityService, CatalogGuard y OwnerGuard y los exporta para consumidores concretos.

## Cómo recorrer esta carpeta

- [Controlador y guards](http/README.md).
- [Sesiones](services/README.md).
- [Persistencia](persistence/README.md).
- [Políticas y secretos](security/README.md).
- [Alta inicial explícita](bootstrap/README.md).

## Reglas y verificación

Cookie HttpOnly, origen exacto y CSRF no cambian. El servidor es la autoridad; no duplicar providers para resolver imports.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
