# Pedidos

[Volver a módulos](../README.md)

[OrdersModule](orders.module.ts) importa identidad y exporta un único OrdersService para checkout.

## Cómo recorrer esta carpeta

- [Consulta administrativa](http/README.md).
- [Persistencia e idempotencia](services/README.md).

## Reglas y verificación

Los pedidos son pruebas locales: no cobran, reservan stock ni despachan. No agregar efectos externos durante la migración del renderizador.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
