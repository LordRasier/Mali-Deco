# Assets de portada

[Portada](../README.md) → [home.css](home.css). `generated/storefront` contiene copias ignoradas, no originales editables. El [preparador](../../../../scripts/copy-storefront-art.mjs) falla si falta cualquier original aprobado; nunca sustituye silenciosamente un archivo perdido por una copia vieja.

`/assets/storefront/` sirve estilos; `/storefront/` sirve las cinco imágenes declaradas. Ambos roots están disponibles sin flags de preview y rechazan archivos vecinos. Los originales están en [resources/storefront](../../../../resources/storefront); el paso `prepare:art` copia únicamente los archivos declarados.
