# Reglas de presentación compartidas

[Volver al catálogo MVC](../README.md)

Este subárbol es una dependencia hoja segura para servidor y navegador. No importar Nest, TypeORM, React, configuración privada ni APIs de navegador con efectos al cargar módulos.

| Archivo | Responsabilidad |
|---|---|
| [catalog-query.ts](catalog-query.ts) | URL de presentación, límites y conversiones de filtros |
| [storefront-types.ts](storefront-types.ts) | Contratos de presentación sin código de ejecución |
| [money.ts](money.ts) | Precisión monetaria y conversión decimal exacta |
| [cart.ts](cart.ts) | Operaciones puras del carrito y formato de importes |
| [demo-catalog.ts](demo-catalog.ts) | Datos sintéticos explícitos, nunca fallback de producción |
| [demo-listing.ts](demo-listing.ts) | Filtrado/orden/paginación de esos datos sintéticos |

Las pruebas nativas de dinero y carrito acompañan al código canónico. Los [contratos compartidos](../../shared/README.md) reexportan estas reglas cuando hace falta; no mantienen una copia divergente.

La validación de la API sigue independiente: su contrato no es idéntico a la URL de presentación. El build de navegador audita su grafo y rechaza módulos de servidor. Véase [la decisión](../../../../docs/decisions/0003-shared-presentation.md).
