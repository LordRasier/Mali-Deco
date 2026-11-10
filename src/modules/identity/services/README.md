# Servicio de identidad

[Volver al nivel anterior](../README.md)

[IdentityService](identity-service.ts) coordina credenciales, límites, sesiones, rotación CSRF y revocación; [su prueba](identity-service.test.ts) usa un store controlado.

## Cómo recorrer esta carpeta

- [Contrato de persistencia](../persistence/README.md).
- [Políticas](../security/README.md).

## Reglas y verificación

Conservar límites y errores seguros. No cambiar la autorización al mover archivos ni registrar otra instancia del servicio en consumidores.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
