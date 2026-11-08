# Configuración de medios

[Volver al nivel anterior](../README.md)

[media-config.ts](media-config.ts) valida cuotas y [media-config.test.ts](media-config.test.ts) protege los límites.

## Reglas y verificación

Configuración inválida no debe ampliar permisos o almacenamiento silenciosamente.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
