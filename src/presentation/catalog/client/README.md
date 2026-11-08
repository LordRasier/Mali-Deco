# Cliente del catálogo MVC

[Volver al catálogo](../README.md) · [Arranque compartido](../../browser/README.md)

[Filtros de navegador](browser/catalog-filters.ts) conserva la URL aplicada y separa el borrador móvil. Categorías/materiales/colores y moneda navegan inmediatamente en escritorio; en móvil solo se aplican al confirmar. Cancelar, Escape y volver a abrir descartan cambios no aplicados.

Las reglas puras están en [catalog-filters.ts](../shared/catalog-filters.ts) y se comparten con la proyección del servidor. Se conservan selecciones que no aparecen en metadatos acotados; no reconstruir el query leyendo solo checkboxes visibles. El máximo de veinte selecciones y la conversión exacta de precios se validan antes de navegar.
