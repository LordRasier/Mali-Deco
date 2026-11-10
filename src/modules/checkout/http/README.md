# Endpoints de checkout

[Volver al nivel anterior](../README.md)

[CheckoutQuoteController](checkout-quote.controller.ts) y [CheckoutOrderController](checkout-order.controller.ts) delegan después de validar la sesión local.

## Cómo recorrer esta carpeta

- [Sesión requerida](../sessions/README.md).
- [Cotización](../services/README.md).
- [Pedidos](../../orders/README.md).

## Reglas y verificación

Crear y consultar un intento requieren Idempotency-Key. No reemplazar el transporte por formularios sin diseñar su adaptación de seguridad.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
