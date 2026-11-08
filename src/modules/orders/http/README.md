# Consulta de pedidos

[Volver al nivel anterior](../README.md)

[AdminOrdersController](admin-orders.controller.ts) lista/detalla pedidos; [OrdersGuard](orders.guard.ts) permite owner/operations.

## Cómo recorrer esta carpeta

- [Servicio de pedidos](../services/README.md).

## Reglas y verificación

Catalog no obtiene permiso de pedidos por poder iniciar sesión. Mantener respuestas y estados persistidos, no inferir éxito de pago.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
