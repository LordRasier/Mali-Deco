# Contenido por instalación

Cada clon utiliza su propio `.env`, base de datos, archivos de medios y proceso. No hay selección de tienda por dominio ni datos compartidos entre Mali y Runica. El catálogo, pedidos, marca y configuración quedan aislados por base de datos.

## Administración

Editor de tienda es un módulo independiente del administrador (`/admin#editor`), con barra superior y un panel lateral plegable de Páginas/Estructura/Propiedades. Páginas separa Tienda, Información y ayuda, y Legales y políticas; muestra la ruta y el estado de cada página. Estructura organiza encabezado, contenido de la página, footer y otros ajustes compartidos en grupos plegables. La selección directa abre la rama correspondiente. La vista previa muestra las páginas completas de Inicio, Catálogo y las informativas: reutiliza sus plantillas públicas, encabezado, imágenes, productos reales, estilos, fuentes y footer. Escritorio ocupa el espacio disponible; tablet y móvil reproducen anchos de 768 y 390 px.

La estructura conserva también los elementos desactivados; al seleccionar un bloque se abren sus propiedades. Editar el footer compartido mantiene la página actual y desplaza la vista hasta el elemento seleccionado. Los textos del inicio se agrupan en Banner principal, Productos destacados y Presentación de la marca. Se pueden agregar, duplicar, quitar y ordenar beneficios, columnas, enlaces y secciones, con arrastre dentro de cada grupo o botones Subir/Bajar. Deshacer y Rehacer conservan hasta 50 pasos durante la sesión.

Guardar borrador persiste el trabajo sin cambiar la tienda pública. Publicar cambios aplica juntos los textos, el footer y los estados de las rutas, incluyendo los cambios todavía no guardados. Restaurar desde publicado reemplaza el borrador con confirmación y no modifica la tienda pública. Recargar trae el último borrador guardado y avisa antes de descartar cambios locales. Los borradores son compartidos por los administradores de una misma instalación; no son copias privadas por usuario.

La publicación y el guardado usan revisiones independientes y una transacción: una pestaña antigua no puede sobrescribir a otra. Si se publica desde la API anterior mientras existe un borrador, este se conserva y se marca desactualizado; hay que revisarlo y restaurar desde publicado antes de continuar. Solo owner puede leer, previsualizar, guardar o publicar; las escrituras conservan la validación de sesión, origen y CSRF.

La selección directa también alcanza títulos, párrafos, textos de botones, pies de imagen, preguntas y respuestas, enlaces y datos de contacto de Inicio, Catálogo y las páginas informativas. Se selecciona el elemento más específico bajo el cursor; Editar bloque completo abre las opciones de su sección. Las preguntas abiertas se conservan al actualizar la vista previa. El resaltado y las marcas de selección solo aparecen dentro del editor; el HTML público mantiene su presentación.

Otros ajustes compartidos en Estructura permite editar funciones, textos de producto, ayuda, carrito y emails, contacto público e identidad fiscal. Esos campos comparten el mismo borrador. Producto, carrito y emails aún no tienen página de vista previa propia. El editor no admite HTML ni scripts, nuevas rutas arbitrarias, estilos libres ni diseño por coordenadas. La vista previa no carga Analytics/GTM ni ejecuta las operaciones de compra; sus enlaces seleccionan elementos sin abrir destinos externos. Al seleccionar imágenes, identidad, redes, productos o categorías, el panel indica el módulo que administra esos datos y ofrece un acceso a él. Estos datos mantienen su guardado independiente; cambiar de módulo conserva el borrador editorial en la sesión.

Listado de productos permite editar columnas en escritorio (2, 3 o 4), productos por página (12, 24, 36 o 48), navegación de categorías, filtros laterales, cantidad de resultados y textos del listado. Las tarjetas permiten mostrar u ocultar categoría, descripción y precio, y cambiar el texto de Ver más. Su diseño es compartido con las tarjetas de Inicio; los anchos menores conservan su adaptación responsive. Seleccionar una tarjeta abre estas propiedades y también el acceso a Productos para cambiar sus datos comerciales. Todos los ajustes de presentación se previsualizan en el borrador y llegan a la tienda al publicar.

En Catálogo → Diseño del listado, **Mostrar filtros laterales** habilita un panel de categoría, material, color, moneda y rango de precio. Desde 1024 px aparece junto a los productos; en tablet y móvil se abre con **Filtrar productos**, permite preparar cambios y aplicarlos con **Ver resultados** o descartarlos al cerrar. Las categorías superiores conservan su opción independiente. El panel comienza desactivado, también al leer configuraciones anteriores, para conservar el catálogo simple de Mali. Se guarda en el JSON de contenido existente y no requiere una nueva migración.

Las páginas informativas y legales permiten editar título, introducción, secciones, párrafos, preguntas y enlaces, además de su publicación. Los textos del índice, contacto e identificación fiscal también son configurables. Los datos del responsable son compartidos entre páginas y pueden heredar los valores iniciales del servidor o usar valores guardados.

El interruptor de un enlace del footer modifica el estado de la página o función que representa, compartido con Páginas y rutas. Desactivar una página conserva su contenido, devuelve 404 en acceso directo y la retira del footer, enlaces internos, sitemap y nuevos emails. Quitar un enlace u ocultar una columna solo cambia la navegación. Los íconos externos, textos y beneficios no representan rutas locales.

Catálogo controla catálogo, categorías, productos y sus APIs públicas. Carrito controla su página, checkout, botones y endpoints de inicio de compra. Desactivar catálogo también hace inoperante el carrito. Los webhooks de pagos y la gestión administrativa de pedidos existentes no se bloquean. Privacidad desactivada suspende la carga de Analytics/GTM para no presentar un consentimiento con un enlace roto.

Rutas nuevas: `/sobre-nosotros`, `/cuidados`, `/seguimiento`, `/cambios-y-devoluciones`, `/arrepentimiento`. `/sobre-mali` redirige a Sobre nosotros solo mientras esté activa; de lo contrario devuelve 404. Los enlaces internos que usaban fragmentos se generan con las rutas nuevas. Un fragmento antiguo no llega al servidor: un favorito con `#cuidados` abre la página padre, donde esa sección ya no se publica.

Los datos de contacto pueden heredar las variables iniciales o usar un valor guardado. Un texto vacío explícito oculta el dato y no recupera el valor anterior. WhatsApp e Instagram se siguen editando en Redes y contacto; los interruptores del footer controlan su presentación allí.

## Apariencia en borrador

**Apariencia general**, sobre la vista previa, permite elegir el fondo base y tipografías independientes para títulos y texto. El catálogo ofrece 12 opciones: Figtree, Georgia, Arial, DM Mono, Manrope, Nunito Sans, Outfit, Lora, Libre Baskerville, Cormorant Garamond, Bitter e IBM Plex Mono. Las fuentes se alojan localmente con sus licencias; Georgia y Arial usan las del dispositivo. No se consulta Google Fonts al navegar o compilar. Botones, navegación y precios conservan la tipografía de acento. Los fondos propios de imágenes, tarjetas, encabezado y footer no se reemplazan con el fondo base.

El catálogo tipográfico es cerrado y administrado por la plataforma, como base del futuro constructor de tiendas. No se permite subir fuentes, introducir URLs ni CSS. Las nuevas familias se incorporan mediante cambios de código revisados, con licencia, procedencia, archivos locales y listas explícitas de publicación. Elegirlas no cambia la tienda hasta publicar el borrador; los diseños anteriores mantienen sus valores.

En las propiedades de cada bloque de Inicio, **Fondo de la sección** y **Texto de la sección** ofrecen selectores de color. Los colores personalizados prevalecen sobre el tema del bloque; sin texto personalizado, un fondo propio elige texto claro u oscuro. **Restablecer** recupera el diseño original, con su propio paso de Deshacer. Las imágenes mantienen su prioridad visual: un fondo no reemplaza una imagen.

La apariencia comparte el borrador, las revisiones, Deshacer/Rehacer y la publicación transaccional del contenido. Guardar o recargar el borrador no cambia la tienda; publicar aplica también la apariencia. El CSS público lee exclusivamente la versión publicada. La vista previa carga un CSS autenticado y sin caché con colores e identificadores validados, no contenido privado, sin permitir CSS libre ni relajar CSP. Los diseños anteriores reciben valores neutros al leerlos y no requieren migración nueva. El color de marca de Configuración conserva su guardado independiente.

## Migración y actualización

Las categorías tienen imagen propia, descripción breve, texto alternativo y un icono elegido entre ocho opciones. Se editan en **Clasificaciones → Categorías → Editar → Imagen e icono**, con un guardado independiente de nombre/orden. Para una categoría nueva, crearla primero y abrirla desde la lista. La carga acepta JPG/PNG/WebP hasta 5 MB y almacena una versión WebP optimizada. Reemplazar o quitar una imagen conserva la categoría y sus productos. Los cambios de presentación se aplican de inmediato a todos sus bloques; no forman parte del borrador de la landing.

El bloque Categorías ofrece **tarjetas con iconos**, **tarjetas con foto** (texto debajo o centrado sobre una capa oscura) e **imágenes circulares**. Sin imagen usa el icono seleccionado. Conserva la selección y el orden de categorías, columnas para escritorio/móvil y las opciones de estilo del bloque. Solo muestra categorías con productos publicados. Los bloques guardados anteriormente reciben el diseño de iconos al leerlos, sin reemplazar títulos ni selecciones.

Para esta función ejecutar `npm run migration:content`: la migración `CategoryPresentation1793362100000` crea `category_presentations`, sin modificar filas existentes de categorías o productos. Si todavía no se aplicó, el catálogo sigue leyendo categorías con su presentación inicial; el guardado de imágenes solicita completar la migración. La reversión rechaza eliminar la tabla si contiene diseños guardados.

La organización del editor y los ajustes del listado no requieren una nueva migración. Al leer contenido o borradores anteriores se completan únicamente los nuevos campos con sus valores iniciales; se conservan los textos personalizados y los estados de publicación. Los valores desconocidos o inválidos siguen siendo rechazados.

`npm run migration:content` aplica las migraciones aditivas pendientes `StoreContent1793361800000` (`store_content_settings`, versión publicada) y `ContentDrafts1793361900000` (`store_content_drafts`, borrador y revisiones). Si ya se migró el contenido, hay que volver a ejecutar el comando para crear la tabla de borradores. En el entorno local ya establecido con root sin contraseña puede usarse `npm run migration:content:local-root`. No se modifica `.env`. Las nuevas instalaciones que ejecutan `migration:run` incorporan ambas tablas junto con el resto del esquema.

Sin la tabla de borradores se conserva el contenido público y el editor muestra que falta migrar. Sin la tabla de contenido se usan los textos iniciales de Mali. No se acepta guardar sin persistencia. Un error de lectura de una base configurada devuelve indisponibilidad, sin reactivar páginas mediante valores por defecto. Los ajustes se leen por solicitud; no requieren reiniciar. La reversión de contenido se rechaza si hay contenido guardado; la de borradores se rechaza si hay trabajo sin publicar.

## Otro clon en producción

1. Clonar el mismo repositorio en la carpeta de la nueva tienda e instalar con `npm ci` (Node 24 o superior).
2. Crear su base, usuario de base, directorio de medios y `.env` independientes. Usar otro puerto y proceso del servidor. Configurar dominio, origen administrativo y secretos de sesión propios; no copiar credenciales de Mali por defecto.
3. Ejecutar las migraciones con la cuenta autorizada de migraciones, crear el owner con `npm run bootstrap:owner` y compilar con `npm run build`.
4. Configurar el proxy y HTTPS para ese dominio hacia el puerto de la nueva instancia.
5. En el admin: identidad, imágenes, redes, contenido y footer, y SEO y medición. Los textos iniciales son una base editable, no una detección automática de Runica.
6. Configurar por instalación pagos, logística y remitente de emails. El remitente y dominio de email no heredan Mali: permanecen sin configurar si faltan sus variables. Las credenciales de proveedores continúan en el servidor.

No se ha habilitado un checkout de producción nuevo: se conservan las condiciones de activación del proyecto. La configuración editorial no convierte los flujos de prueba en pagos reales.
