# Validación del catálogo

[Volver al nivel anterior](../README.md)

[catalog-validation.ts](catalog-validation.ts) valida entradas de producto y parámetros del catálogo; [su prueba](catalog-validation.test.ts) conserva los límites.

## Reglas y verificación

Validar antes de persistir. No convertir silenciosamente entradas inválidas ni ampliar contratos por reorganizar.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
