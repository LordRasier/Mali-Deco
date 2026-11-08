# Localidades y candidatos

[Volver al nivel anterior](../README.md)

[PostalCodeResolver](postal-code-resolver.ts) mantiene caché, límites y candidatos opacos. [Pruebas](postal-code-resolver.test.ts) controlan transporte y reloj.

## Reglas y verificación

No duplicar el resolver entre módulos: un candidato emitido para envíos debe ser reconocible por checkout y compartir límites.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
