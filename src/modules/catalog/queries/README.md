# Consultas públicas del catálogo

[Volver al nivel anterior](../README.md)

[listPublicProducts](public-listing.ts) usa [consulta validada](listing-query.ts) y [fragmentos SQL](listing-sql.ts). [Imágenes públicas](public-images.ts) proyecta únicamente medios publicables.

## Cómo recorrer esta carpeta

- [Servicios consumidores](../services/README.md).

## Reglas y verificación

Mantener paginación, filtros por una misma variante y proyecciones públicas. Las pruebas aquí no autorizan ejecutar consultas contra una base real.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
