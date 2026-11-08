# Resolución autoritativa del carrito

[Volver al nivel anterior](../README.md)

[PublicCartController y PublicCartResolver](cart-resolver.ts) reciben identificadores/cantidades y resuelven precios/variantes publicadas. [La prueba](cart-resolver.test.ts) comprueba particiones y rechazo de entradas inválidas.

## Reglas y verificación

Esta carpeta no guarda el carrito del navegador. Una respuesta parcial o un fallo no equivale a artículos ausentes; conservar el contrato con el cliente.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
