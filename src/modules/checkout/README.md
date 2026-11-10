# Checkout local

[Volver a módulos](../README.md)

[CheckoutModule](checkout.module.ts) importa ShippingModule y OrdersModule. No registra otra instancia de PostalCodeResolver u OrdersService.

## Cómo recorrer esta carpeta

- [Endpoints](http/README.md).
- [Capacidad local y cookie](sessions/README.md).
- [Cotización](services/README.md).

## Reglas y verificación

Permanece deshabilitado por defecto y fuera de producción. API JSON, origen, headers, CSRF e idempotencia se conservan.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
