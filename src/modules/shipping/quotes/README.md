# Cotización local

[Volver al nivel anterior](../README.md)

[catalog-quote.ts](catalog-quote.ts) conserva controlador, parseo y servicio actuales; [local-quote-guard.ts](local-quote-guard.ts) restringe el endpoint; [quote-session.ts](quote-session.ts) gestiona el estado correspondiente.

## Cómo recorrer esta carpeta

- [Localidades](../postal/README.md).
- [Proveedores](../providers/README.md).

## Reglas y verificación

Un error nunca es envío gratis. Mantener activación explícita, loopback, origen/host y JSON. Separar el archivo híbrido sería otra unidad, no parte de estos movimientos.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
