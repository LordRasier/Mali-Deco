# Persistencia de identidad

[Volver al nivel anterior](../README.md)

[identity-store.ts](identity-store.ts) define el contrato y MysqlIdentityStore; [sus pruebas](identity-store.test.ts) verifican consultas y representación.

## Reglas y verificación

Persistir hashes y parámetros explícitos; no filtrar credenciales o consultas en mensajes. La conexión se inyecta desde la composición.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
