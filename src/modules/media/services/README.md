# Casos de uso de medios

[Volver al nivel anterior](../README.md)

[MediaService](media-service.ts) coordina carga, orden, texto alternativo y retiro/restauración. [Pruebas](media-service.test.ts) verifican resultados y reintentos.

## Cómo recorrer esta carpeta

- [Repositorio](../persistence/README.md).
- [Procesador](../processing/README.md).

## Reglas y verificación

Una respuesta incierta no autoriza duplicar la carga. No omitir conflictos de revisión por comodidad de la UI.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
