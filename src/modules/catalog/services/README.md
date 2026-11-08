# Casos de uso del catálogo

[Volver al nivel anterior](../README.md)

[PublicCatalog](public-catalog.ts) coordina lectura; [PublicFacets](public-facets.ts) obtiene opciones globales. [CatalogAdmin](catalog-admin.ts) y [CatalogTaxonomy](catalog-taxonomy.ts) coordinan operaciones administrativas.

## Cómo recorrer esta carpeta

- [Consultas de lectura](../queries/README.md).
- [Modelos](../models/README.md).

## Reglas y verificación

Pruebas junto a cada servicio. La conexión es opcional para arrancar offline, no para simular resultados. No cambiar reglas de archivo, límites o SQL al reorganizar.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
