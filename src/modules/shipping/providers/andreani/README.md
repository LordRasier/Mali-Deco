# Consulta Andreani

[Volver al nivel anterior](../README.md)

[andreani-query.ts](andreani-query.ts) serializa la consulta y [andreani-response.ts](andreani-response.ts) valida la respuesta. [Pruebas](andreani.test.ts) usan ejemplos controlados.

## Reglas y verificación

No confiar en una respuesta externa ni completar destinos por suposición. Consultar la guía de envíos antes de habilitar red.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
