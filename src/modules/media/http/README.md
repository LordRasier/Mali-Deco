# HTTP de medios

[Volver al nivel anterior](../README.md)

[media.controller.ts](media.controller.ts) sirve medios y operaciones administrativas; [media-upload.interceptor.ts](media-upload.interceptor.ts) limita la carga.

## Cómo recorrer esta carpeta

- [Servicio](../services/README.md).

## Reglas y verificación

La autorización debe ejecutarse antes del procesamiento multipart. Mantener If-Match, Idempotency-Key y respuestas de error conocidas; pruebas HTTP junto al controlador.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
