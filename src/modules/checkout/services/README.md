# Cotización de checkout

[Volver al nivel anterior](../README.md)

[CheckoutQuoteService](quote.ts) captura una cotización propia y acotada; la factory deshabilita el proveedor si falta configuración válida. [Pruebas](quote.test.ts) usan dobles.

## Cómo recorrer esta carpeta

- [Resolución postal compartida](../../shipping/postal/README.md).

## Reglas y verificación

El resolver postal es compartido con envíos. La estimación del carrito no autoriza una orden ni una reserva de stock.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
