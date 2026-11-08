# Contratos de envío

[Volver al nivel anterior](../README.md)

[shipping-provider.ts](shipping-provider.ts) y [shipping.types.ts](shipping.types.ts) definen el límite entre intención, resultados y adaptadores.

## Reglas y verificación

Los contratos no conocen vistas o transporte concreto. No transformar indisponibilidad en cobertura o precio cero.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
