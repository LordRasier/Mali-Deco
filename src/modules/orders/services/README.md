# Servicio de pedidos

[Volver al nivel anterior](../README.md)

[OrdersService](orders.service.ts) coordina snapshots, transacciones locales, replay y consulta de intentos; [orders.test.ts](orders.test.ts) verifica estos contratos.

## Reglas y verificación

Una respuesta incierta se consulta con la misma clave antes de reintentar. Mantener importes enteros y estados explícitos.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
