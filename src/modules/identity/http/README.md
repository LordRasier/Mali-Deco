# HTTP de identidad

[Volver al nivel anterior](../README.md)

[AuthController](auth.controller.ts) atiende login, identidad, CSRF y logout. [http.ts](http.ts) interpreta cookies/headers; [CatalogGuard](catalog.guard.ts) y [OwnerGuard](owner.guard.ts) autorizan operaciones.

## Cómo recorrer esta carpeta

- [Servicio de identidad](../services/README.md).

## Reglas y verificación

No confundir navegación visible con permiso. Los cambios de cookie, origen y CSRF requieren pruebas explícitas; no devolver secretos de sesión en JSON.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
