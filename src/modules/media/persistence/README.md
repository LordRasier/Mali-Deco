# Persistencia de medios

[Volver al nivel anterior](../README.md)

[MediaRepository](media-repository.ts) conserva consultas, transacciones, cuotas y revisiones. [Pruebas](media-repository.test.ts) están junto al código.

## Reglas y verificación

No mover DDL o limpiar datos desde servicios. Los cambios de esquema pertenecen a migraciones explícitas.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
