# Sesión local de checkout

[Volver al nivel anterior](../README.md)

[session.ts](session.ts) reúne controlador y servicio de la capacidad local; [session.test.ts](session.test.ts) protege creación, reutilización, recuperación y descarte.

## Reglas y verificación

store_checkout está limitada a /api/v1/checkout. Una página HTML /checkout no la recibe. No rotar una capacidad válida ni ignorar cookies duplicadas.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
