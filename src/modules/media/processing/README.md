# Procesamiento de imágenes

[Volver al nivel anterior](../README.md)

[image-processor.ts](image-processor.ts) valida/procesa imágenes y genera derivados; [su prueba](image-processor.test.ts) ejercita límites y formatos.

## Reglas y verificación

No confiar solo en extensión o MIME del cliente. Conservar restricciones y dimensiones de derivados.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
