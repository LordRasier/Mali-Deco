# Catálogo

[Volver a módulos](../README.md)

[CatalogModule](catalog.module.ts) agrupa lectura pública, administración, variantes y clasificaciones. Importa identidad para autorizar la administración; sus providers no se duplican en el arranque.

Exporta `PublicCatalog` y `PublicFacets` para el [catálogo SSR](../../presentation/catalog/README.md), y `CatalogAdmin` y `CatalogTaxonomy` para la [administración HTML](../../presentation/admin/README.md). Se reutilizan las instancias del módulo, sin duplicar providers ni conexiones; cada entrada administrativa autoriza antes de leer.

## Cómo recorrer esta carpeta

- [Entradas HTTP](controllers/README.md).
- [Casos de uso](services/README.md).
- [Modelos y dinero](models/README.md).
- [Consultas públicas](queries/README.md).
- [Validación](validation/README.md).
- [Resolución de carrito](cart/README.md).

## Reglas y verificación

GET /api/v1/catalog/facets → controlador → PublicFacets → consultas acotadas. Precios enteros y falta de base explícita; no activar demo por un error.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
