# Contratos del navegador

[Volver a pruebas](../README.md). Ejecutar `npm run test:client` desde la raíz.

- Carrito y envíos: estado concurrente, resolución, almacenamiento, DOM y destino compartido.
- Producto y catálogo: parsers, selección, paginación, arte y plantillas reales.
- Administración: sesión, roles, borradores, formularios, medios y respuestas inciertas.
- Checkout: estado, DOM, transporte, recuperación y ausencia de reenvíos automáticos.

Los archivos `*.test.mjs` ejecutan checks o aserciones puras. [Entorno del hijo](support/test-environment.mjs) elimina `NODE_TEST_CONTEXT`: sin ello Node puede omitir pruebas anidadas con salida exitosa. [Regresión](../architecture/nested-tests.test.mjs).

Los dobles DOM no prueban layout, el selector de archivos del sistema ni BFCache real. Ver [cobertura de reemplazo](../../docs/renderer-retirement.md) y [límites finales](../../docs/rework-completion.md).
