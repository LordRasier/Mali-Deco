# Políticas de identidad

[Volver al nivel anterior](../README.md)

[access.ts](access.ts) comprueba roles/origen/CSRF; [security.ts](security.ts) maneja hashing y secretos; [email.ts](email.ts) centraliza la representación del correo; [origin-config.ts](origin-config.ts) valida el origen.

## Reglas y verificación

Las migraciones históricas conservan sus reglas congeladas. No importar estas funciones dentro de migraciones antiguas para cambiar su semántica.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
