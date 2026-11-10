# Entradas HTTP del catálogo

[Volver al nivel anterior](../README.md)

[CatalogController](catalog.controller.ts) sirve lectura pública. [AdminCatalogController](admin.controller.ts) administra productos/variantes; [controladores de taxonomías](admin-taxonomy.controller.ts) mantienen rutas concretas para no capturar productos.

## Cómo recorrer esta carpeta

- [Servicios invocados](../services/README.md).

## Reglas y verificación

El prefijo API pertenece al arranque. Los controladores delegan; los guards conservan roles, origen y CSRF.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
