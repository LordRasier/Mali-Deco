# Detalle de producto

La ruta `/productos/:slug` consulta el catálogo público y representa la selección en `?variant=<id>`. Desde las cards, la navegación conserva la variante que coincidió con la búsqueda. La historia del navegador conserva la URL previa de filtros y páginas.

El primer bloque de variantes se carga con límite 100. Una variante solicitada fuera del bloque se valida mediante la resolución de pares de carrito con el ID de producto verificado; no se sustituye otra variante si el enlace es inválido o ya no existe. Cada página adicional se solicita de forma independiente, se rechazan respuestas desactualizadas y los IDs se deduplican. Las dimensiones públicas son solo ancho, alto y largo del producto, en milímetros; los datos del embalaje y SKU no se exponen. Las dimensiones pertenecen al producto y no cambian al seleccionar una variante.

Solo un 404 del endpoint de producto produce una página no encontrada. La configuración, ajustes de tienda, red, timeout o respuestas inválidas se presentan como indisponibilidad y reintento; nunca se usa demo como fallback. Demo exige `STOREFRONT_MODE=demo` y entorno de desarrollo, e indica imágenes y precios ficticios. Las imágenes reales publicadas tienen prioridad; sin imagen se muestra un marcador neutro. El arte sintético corresponde únicamente a demo o al fixture de desarrollo explícito. No se han implementado cobros, envíos ni carga de archivos en este incremento.

`PUBLIC_SITE_URL` es opcional; cuando contiene un origen HTTP(S) válido, sin credenciales, ruta, consulta o fragmento, se usa para la URL canónica de páginas reales. No se asigna un dominio por defecto. Demo se marca `noindex`.

Implementación: [presentación del producto](../src/presentation/products/README.md), [estado del navegador](../src/presentation/products/client/state/README.md) y [contrato público](catalog-public-api.md).

## Compartir artículos

El botón de compartir de cada tarjeta ofrece WhatsApp, Instagram y copiar enlace. El enlace utiliza `/catalogo?articulo=<id>#producto-<id>`: el ID no cambia al renombrar el producto y la consulta permite resolverlo en el servidor, porque el fragmento no llega al servidor.

- Al abrirlo, el catálogo destaca y enfoca la tarjeta sin abrir automáticamente su información. Si el artículo no está en la primera página, aparece en un bloque propio; si ya estaba, no se duplica.
- El HTML incluye título, descripción y primera imagen pública del artículo en Open Graph. Requiere el dominio público HTTPS configurado en SEO o `PUBLIC_SITE_URL`; las plataformas controlan la creación y caché de sus miniaturas. Sin foto se conserva la imagen general de la tienda, sin inventar una foto del artículo.
- WhatsApp recibe un mensaje con nombre y enlace. Instagram usa el menú de compartir del dispositivo cuando está disponible: no puede garantizarse que Instagram aparezca entre los destinos. Sin ese menú se copia el enlace para pegarlo en un mensaje; si falla el portapapeles, se ofrece un campo seleccionable. Cancelar no copia ni publica nada.
- Sin JavaScript, el desplegable conserva un enlace navegable al artículo. En demo no se muestra el botón. El editor visual mantiene el mismo aspecto, pero su vista sin scripts y su interceptor de navegación impiden compartir o salir del borrador.

Solo se consultan productos públicos activos y no archivados. Un producto ausente responde 404, un ID inválido 400 y un fallo de lectura 503. Las páginas compartidas llevan `noindex, follow`, sin reemplazar las URL canónicas de producto existentes. No se incluyen SDKs de redes, cargas de archivos, escrituras de contenido ni migraciones.

Verificación local: `src/presentation/catalog/product-sharing.test.ts`, `tests/http/product-sharing.test.ts` y `tests/browser/product-sharing.test.cjs`. La prueba de navegador necesita Playwright instalado (o `PLAYWRIGHT_MODULE_PATH`) y se ejecuta con `node --import tsx --test tests/browser/product-sharing.test.cjs`; intercepta todas las solicitudes y no utiliza cuentas sociales ni una base real. La miniatura efectiva en redes requiere una comprobación después del despliegue.

Referencias: [Open Graph](https://ogp.me/), [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) y [enlaces de WhatsApp](https://faq.whatsapp.com/5913398998672934/).

Si las páginas de variantes se solapan, se informa que el catálogo cambió y se ofrece reiniciar la carga conservando la URL. La variante solicitada fuera de la primera página se mantiene aparte y no se confunde con una página duplicada.

Las mutaciones del carrito vuelven a leer el estado vigente antes de aplicarse. Cuando el navegador ofrece Web Locks, las pestañas cooperantes serializan sus escrituras; eventos `storage`, cambios dentro de la misma página y `pageshow` sincronizan vistas. Un identificador de revisión impide que una resolución antigua elimine un artículo que se quitó y volvió a agregar. El arreglo guardado mantiene su formato existente, con la revisión en una clave auxiliar. Las pestañas con código antiguo no participan del bloqueo. Sin Web Locks, se copia una vez el carrito compartido a sessionStorage y las modificaciones posteriores quedan aisladas en esa pestaña, incluso al navegar o recargar; no se escriben datos compartidos sin bloqueo y no se sincronizan otras pestañas. La copia de la pestaña se prioriza durante su vida para evitar perder cambios si reaparece Web Locks. Si tampoco está disponible sessionStorage, los cambios quedan solo en memoria hasta cerrar la página. La interfaz informa el alcance.
