# Modelos y reglas del catálogo

[Volver al nivel anterior](../README.md)

[Entidades](catalog.entities.ts) definen el mapeo persistido; [tipos](catalog.types.ts) definen contratos. [Dinero](price.ts) y [variantes](variant.ts) contienen reglas pequeñas verificadas junto al código.

## Reglas y verificación

No son un segundo esquema: los cambios de almacenamiento requieren migraciones explícitas. Los importes son enteros seguros en unidades menores.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
