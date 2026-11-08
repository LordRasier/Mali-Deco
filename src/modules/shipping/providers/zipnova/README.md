# Cotización Zipnova

[Volver al nivel anterior](../README.md)

[zipnova-provider.ts](zipnova-provider.ts) adapta el contrato, [zipnova-transport.ts](zipnova-transport.ts) controla HTTP y [zipnova.ts](zipnova.ts) valida configuración/datos.

## Reglas y verificación

Requiere activación explícita. Mantener límites, endpoint permitido e importes exactos; cotizar no crea un envío.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
