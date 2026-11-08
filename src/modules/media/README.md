# Medios de productos

[Volver a módulos](../README.md)

[MediaModule](media.module.ts) importa identidad; MediaService usa un único MediaRepository configurado por el módulo.

## Cómo recorrer esta carpeta

- [Endpoints y carga](http/README.md).
- [Casos de uso](services/README.md).
- [Persistencia](persistence/README.md).
- [Procesamiento](processing/README.md).
- [Cuotas](config/README.md).

## Reglas y verificación

Conservar permisos, límites, revisión optimista, idempotencia y diferencia entre retiro/restauración de imágenes y archivo de productos.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
