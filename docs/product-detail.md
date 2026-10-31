# Detalle de producto

La ruta `/productos/[slug]` consulta el catálogo público y representa la selección en `?variant=<id>`. Desde las cards, la navegación conserva la variante que coincidió con la búsqueda. La historia del navegador conserva la URL previa de filtros y páginas.

El primer bloque de variantes se carga con límite 100. Una variante solicitada fuera del bloque se valida mediante la resolución de pares de carrito con el ID de producto verificado; no se sustituye otra variante si el enlace es inválido o ya no existe. Cada página adicional se solicita de forma independiente, se rechazan respuestas desactualizadas y los IDs se deduplican. Las dimensiones públicas son solo ancho, alto y largo del producto, en milímetros; los datos del embalaje y SKU no se exponen. Las dimensiones pertenecen al producto y no cambian al seleccionar una variante.

Solo un 404 del endpoint de producto produce una página no encontrada. La configuración, ajustes de tienda, red, timeout o respuestas inválidas se presentan como indisponibilidad y reintento; nunca se usa demo como fallback. Demo exige `STOREFRONT_MODE=demo` y entorno de desarrollo, e indica imágenes y precios ficticios. La imagen real no está soportada por la API actual y se muestra un marcador neutro. No se han implementado cobros, envíos ni carga de archivos en este incremento.

`PUBLIC_SITE_URL` es opcional; cuando contiene un origen HTTP(S) válido, sin credenciales, ruta, consulta o fragmento, se usa para la URL canónica de páginas reales. No se asigna un dominio por defecto. Demo se marca `noindex`.

Referencias de la versión utilizada: [rutas dinámicas de Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes), [notFound](https://nextjs.org/docs/app/api-reference/functions/not-found) y [metadatos](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

Si las páginas de variantes se solapan, se informa que el catálogo cambió y se ofrece reiniciar la carga conservando la URL. La variante solicitada fuera de la primera página se mantiene aparte y no se confunde con una página duplicada.

Las mutaciones del carrito vuelven a leer el estado vigente antes de aplicarse. Cuando el navegador ofrece Web Locks, las pestañas cooperantes serializan sus escrituras; eventos `storage`, cambios dentro de la misma página y `pageshow` sincronizan vistas. Un identificador de revisión impide que una resolución antigua elimine un artículo que se quitó y volvió a agregar. El arreglo guardado mantiene su formato existente, con la revisión en una clave auxiliar. Las pestañas con código antiguo no participan del bloqueo. Si Web Locks o el almacenamiento no están disponibles, se carga la última copia legible, pero los cambios quedan en memoria y se avisa que no persistirán al cerrar la página; no se realizan escrituras compartidas sin bloqueo.
