# Infraestructura y pruebas de base

[Volver a infraestructura](../README.md)

[database-options.ts](database-options.ts) configura TypeORM; [strict-data-source.ts](strict-data-source.ts) y [strict-pool.ts](strict-pool.ts) protegen la conexión. [Migraciones](migrations) conservan identidad y SQL.

## Cómo recorrer esta carpeta

- [Arnés aislado](../../../tests/browser/checkout-browser-harness.ts).
- [Regresión del inventario](../../../tests/browser/checkout-browser-schema.test.ts).

## Reglas y verificación

Los arneses y pruebas ya están fuera de `src`, en [tests](../../../tests/README.md). No ejecutar integración, bootstrap o migraciones sin autorización y exclusividad. synchronize permanece false. Las migraciones conservan sus nombres y DDL tras la consolidación.

Las pruebas sin conexión están en [tests/database](../../../tests/database/README.md); ejecutar `npm run test:server` desde la raíz. Las pruebas de integración real se ejecutan por separado y con autorización.
