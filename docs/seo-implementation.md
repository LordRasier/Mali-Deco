# SEO y medición administrable

Implementación local del 9 de noviembre de 2026. Complementa `seo-audit-2026-11-08.md`; no acredita un despliegue, indexación ni recepción de eventos en una cuenta de Google.

## Configuración desde administración

Ingresar como **owner** a **Configuración → SEO y medición**. Guardado independiente de identidad, redes e imágenes.

| Campo | Comportamiento |
| --- | --- |
| Dominio público | Origen HTTPS sin barra final, puerto ni ruta. Ejemplo: `https://mali-store.com.ar`. Si está vacío se usa `PUBLIC_SITE_URL`. |
| Título y descripción del inicio | Opcionales; vacíos utilizan los textos generales de la marca. |
| Medición de visitas | Desactivada, Google Analytics 4 o Google Tag Manager. Desactivada inicialmente. |
| ID de Analytics | ID de medición `G-…`; no pegar el fragmento HTML. |
| ID de Tag Manager | Contenedor web `GTM-…`; no pegar scripts ni el iframe noscript. |

Solo un modo se carga. Para usar GA4 mediante GTM, seleccionar GTM y configurar la etiqueta de Google dentro de ese contenedor. El sitio no vuelve a instalar GA4 por separado. Tampoco puede evitar duplicados creados dentro del propio contenedor.

Los cambios se aplican a las siguientes respuestas HTML, sin recompilar ni reiniciar PM2. Las páginas que ya están abiertas mantienen su configuración hasta recargarse. Si dos administradores guardan simultáneamente, la revisión antigua recibe 409; se conserva el borrador y se ofrece una recarga explícita.

Los endpoints `GET/PUT /api/v1/admin/settings/seo` usan `OwnerGuard`, sesión y CSRF para escrituras. Los IDs son públicos por naturaleza, pero solo el owner puede modificarlos. No hay campo para HTML o JavaScript arbitrario.

## Instalación en el servidor

Para la base **local de desarrollo** configurada con `root` sin contraseña, usar:

```bash
npm run migration:seo:local-root
```

Este comando usa el mecanismo local existente: exige `NODE_ENV=development` y `DB_HOST=127.0.0.1`, y habilita la contraseña vacía solo en ese proceso. No modifica `.env` ni los permisos de la cuenta. En el servidor se utiliza el comando normal con sus credenciales configuradas.

Luego de subir esta versión, desde el directorio del proyecto y con las dependencias instaladas:

```bash
npm run build
npm run migration:seo
pm2 restart mali-deco --update-env
```

El proceso existente debe conservar su carga de `.env` mediante `--env-file=.env`, como en el arranque configurado para este proyecto. `--update-env` por sí solo no hace que Node lea un archivo `.env`. La medición requiere `NODE_ENV=production`. `ADMIN_ORIGIN` conserva su función de seguridad y no se reemplaza por el dominio SEO.

`migration:seo` carga `.env` y ejecuta únicamente la migración nueva `SiteSeo1793361700000` sobre la base configurada. Crea `store_site_settings` y `product_slug_redirects`. No ejecuta las otras migraciones pendientes. El comando habitual `migration:run` también descubre esta migración.

Sin la tabla de ajustes, la tienda funciona con medición desactivada y el panel informa que debe actualizarse la base. Renombrar un producto requiere la tabla de historial: se rechaza el cambio si falta para no perder su URL anterior. El rollback se niega a descartar configuraciones o redirecciones pobladas.

Esta implementación no ejecutó migraciones ni reinició procesos del servidor. Verificar primero el destino de la base y el respaldo habitual del despliegue.

## Consentimiento y eventos

- No se solicita ningún script de Google antes de aceptar. Aceptar y rechazar son acciones visibles equivalentes.
- La preferencia se conserva durante 180 días en almacenamiento local, separada por modo e ID. Un cambio de ID solicita una nueva elección.
- El botón «Preferencias de medición» del footer permite cambiarla. Revocar envía el estado denegado, borra cookies `_ga` accesibles y recarga para detener etiquetas ya cargadas.
- Administración, carrito, checkout, errores, modo demo y entornos que no sean producción quedan fuera de la carga.
- GA4 directo configura una vista de página por carga. Se emite `contact_click` con canal (`instagram`, `whatsapp` o `email`) y ruta, sin el teléfono, dirección de email ni destino completo.
- En GTM, `contact_click` es un evento de `dataLayer`: crear el disparador de evento personalizado y su etiqueta de evento GA4. El sitio no configura automáticamente el contenedor remoto.
- Se conserva atribución UTM mediante etiquetas de campaña acotadas. Se omiten de la URL enviada las búsquedas, parámetros arbitrarios, fragmentos e identificadores publicitarios. Usar nombres de campaña sin datos personales.
- Las señales y los consentimientos publicitarios permanecen denegados. No se integra Ads, remarketing, Meta Pixel ni otras plataformas en esta fase.

El contenedor debe configurarse para analítica y respetar consentimiento. Sus etiquetas pueden requerir ajustes adicionales: la CSP permite los destinos de GA/GTM y nonce, no habilita `unsafe-inline`, `unsafe-eval` ni cualquier dominio de terceros. Revisar también la medición mejorada del flujo GA4 para evitar eventos duplicados o captura no deseada de formularios/búsquedas. Los controles del sitio no auditan lo que el owner publica en Google.

No se emiten `purchase` ni ventas inferidas desde un clic: el flujo comercial continúa por Instagram. `contact_click` mide intención de contacto, no una venta confirmada. Los eventos de ecommerce y confirmación comercial quedan para otra etapa.

## Base técnica de SEO incluida

| Área | Resultado |
| --- | --- |
| HTML de servidor | Título, descripción, robots, canonical, Open Graph y Twitter para inicio, catálogo, categorías, productos e información. |
| Duplicados | Canonical elimina campañas y variantes de la URL de producto; paginación mantiene su propia URL. Filtros, búsqueda y estados vacíos llevan noindex. |
| Categorías | `/categorias/:slug`, navegación y paginación; categoría desconocida devuelve 404. |
| Descubrimiento | `/robots.txt`, `/sitemap.xml`, `/sitemaps/pages.xml` y productos por lotes de 1.000. Se incluyen productos activos no archivados; no variantes ni búsquedas. |
| Datos estructurados | `WebSite`, `Organization`, `BreadcrumbList`, `Product`/`ProductGroup` y `Offer`, según el contenido y los datos disponibles. |
| Precios y variantes | Precio y disponibilidad iniciales en el HTML; la variante solicitada se resuelve aunque esté fuera de las primeras 100. Opciones con enlaces reales. |
| Historial de URL | Cambiar un slug guarda el anterior. Una petición a un slug antiguo redirige 301 directamente al slug vigente de un producto activo. No permite reutilizarlo en otro producto. |
| Campañas | Los parámetros UTM y click IDs reconocidos ya no invalidan el catálogo. Se selecciona la moneda predeterminada sin redirección ni reinicio de página. |
| Caché | Archivos estáticos públicos con validadores ETag/Last-Modified y revalidación. HTML y administración mantienen sus políticas de no-store. |

Si no se configuró un origen HTTPS válido, se omiten URLs absolutas/canonical/schema y el sitemap responde 503, en lugar de inventar un dominio o entregar un sitemap vacío exitoso. Si falla la base, tampoco se declara exitoso un listado vacío de sitemap. En desarrollo, robots impide rastreo y las páginas llevan noindex.

No se inventan reseñas, estrellas, GTIN, descuentos ni disponibilidad. Para fabricación a pedido se muestra ese texto y se omite la disponibilidad estructurada si no existe un estado equivalente confirmado. `AggregateOffer` no se usa para agrupar variantes. Las fotos y los atributos reales del catálogo condicionan la elegibilidad de los resultados enriquecidos.

## Verificación antes de activar Google

1. Guardar dominio e ID en administración, abrir una ventana sin preferencias guardadas y comprobar que no haya solicitudes a Google hasta aceptar.
2. Aceptar, confirmar la recepción en la propiedad/contenedor correcto y comprobar que no haya dos vistas de página por navegación.
3. Rechazar, recargar y comprobar que no se descarguen etiquetas. Repetir desde «Preferencias de medición» luego de aceptar.
4. Revisar un producto real con Rich Results Test, y comprobar canonical, imágenes, precio y variante en el HTML fuente.
5. Verificar el dominio en Search Console, enviar `/sitemap.xml` y revisar páginas excluidas e indexadas.
6. Medir Core Web Vitals en el dominio público, especialmente la imagen principal y scripts del contenedor.

Pruebas locales: compilación, tipos, lint; pruebas de configuración, revisión optimista, permisos, consentimiento, GTM/GA4, serialización JSON-LD, canonicals, migración e historial de slugs. El recorrido HTTP nuevo usa solicitudes Node/Express en memoria y renderiza los templates reales sin depender de puertos. Algunas suites preexistentes que abren conexiones loopback no pueden completarse en el entorno restringido (`EACCES 127.0.0.1`). No hay comprobación de entrega real a Google ni migración ejecutada contra MariaDB en esta entrega.

## Trabajo posterior del análisis SEO

- Contenido editorial real de categorías/productos, fotos, medidas, materiales, diferenciación y políticas comerciales completas.
- Overrides de metadatos por producto/categoría en administración, si hacen falta sobre la generación automática.
- Validación del dominio, HTTPS y redirecciones de host en Nginx; Search Console y medición con tráfico real.
- Auditoría de rendimiento y optimización de imágenes; los cambios de caché no equivalen a una mejora medida de Core Web Vitals.
- Seguimiento de contactos/ventas y estrategia de búsquedas según demanda. Merchant Center depende de habilitar un flujo comercial elegible.

Referencias técnicas: [instalación de gtag](https://developers.google.com/tag-platform/gtagjs), [consentimiento](https://developers.google.com/tag-platform/security/guides/consent), [CSP de Google Tag Platform](https://developers.google.com/tag-platform/security/guides/csp). Para fuentes de SEO, ver el análisis previo.
