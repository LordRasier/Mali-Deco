# Catálogo renderizado en el servidor

[Volver a presentación](../README.md) · [Mapa de rutas](../../../docs/routes.md)

`GET /catalogo` → [controlador](catalog.controller.ts) → [orquestador de lectura](catalog-page.ts) → [proyección](catalog-view.ts) → [plantilla](views/catalog.hbs). El panel de carrito/cotización es un parcial compartido, no otra implementación.

El controlador conserva parámetros repetidos hasta validar la URL. El orquestador usa las instancias públicas exportadas por el módulo de catálogo; no hace HTTP contra su propia API ni crea conexiones nuevas. La proyección transforma explícitamente `matchedVariant` al modelo de presentación. La lógica de consulta SQL y sus validaciones siguen perteneciendo al dominio de catálogo.

## Estados y límites

- URL inválida: HTML 400, sin leer servicios; limpiar requiere una acción explícita.
- Moneda ausente: redirect local a la primera moneda publicada en metadatos, preservando filtros y reiniciando página. Nunca asumir ARS en datos reales.
- Moneda solicitada no disponible: aviso explícito; no sustituirla ni mostrar otros productos.
- Error de servicio: HTML 503 sin datos demo ni formularios que puedan descartar filtros. Reintentar conserva la consulta.
- Demo: solo modo explícito de desarrollo; no llama a servicios de base y conserva `noindex`.

El recorrido es permanente en Nest. Las consultas de búsqueda, orden y filtros existentes conservan sus parámetros GET; las categorías y la paginación utilizan enlaces nativos. Las respuestas públicas API correctas son indexables; errores y demo no lo son.

## Presentación de la colección

Inicio y catálogo comparten una tarjeta blanca redondeada: fotografía cuadrada con transición suave a blanco, categoría real cuando existe, nombre, opciones y fila de precio/compra. El icono de información y el nombre abren la misma ventana accesible; sin JavaScript conservan enlaces a la ficha individual. La tipografía utiliza Figtree y DM Mono alojadas localmente. El botón principal de la tarjeta es una cápsula azul; el inicio y la ventana conservan sus acciones outline.

El icono de información mide 30 × 30 px. Su ventana muestra solo la descripción y las medidas generales, con una X de cierre outline: sin selector de variantes, confirmación de opción ni enlace a la ficha. La selección paginada sigue disponible en una vista separada, abierta únicamente desde «Ver opciones» o el acceso a colores adicionales de la tarjeta.

Si el producto tiene descripción, la tarjeta la muestra debajo de la compra, tras un separador: misma tipografía discreta del aviso de selección, máximo dos líneas con puntos suspensivos y «Ver más» para abrir la información completa. Sin JavaScript, ese enlace conserva la ficha individual; las descripciones vacías no generan un bloque de relleno.

La grilla muestra tres columnas desde 1024 px, dos desde 600 px y una en pantallas menores. Los parámetros GET de búsqueda, ordenación, filtros y paginación siguen admitidos, aunque sus controles de edición no se presentan.

El encabezado del catálogo está centrado, con las categorías reales debajo en cápsulas outline de igual ancho (156 px; dos columnas iguales en móvil). La selección mantiene el azul de la marca y conserva los parámetros de los filtros. El fondo general es blanco; las tarjetas compartidas se distinguen con un borde negro de 1 px al 20 % de opacidad, sin sombra.

La navegación visible del catálogo utiliza las categorías, sin barra de búsqueda/ordenación ni panel de filtros. El título principal aparece una sola vez; sobre las tarjetas queda únicamente el contador de resultados. La búsqueda de la cabecera global está retirada temporalmente; los parámetros de enlaces existentes, sus acciones de limpieza y la paginación siguen funcionando.

La cabecera del catálogo reutiliza el banner local del inicio como fondo decorativo de ancho completo. Tiene desenfoque suave y un degradado hacia blanco; no intercepta interacciones ni se anuncia como imagen de producto. Las tarjetas conservan el ancho máximo de 1280 px y su fondo blanco, sin modificar la imagen ni el banner del inicio.

Las opciones pertenecen a cada tarjeta. Una variante se selecciona automáticamente; varias requieren una elección. Colores inequívocos usan círculos accesibles con anillo de selección y nombre visible: hasta seis y acceso a los restantes. Variantes genéricas o colores repetidos usan botones o un selector. No se inventan tamaños, combinaciones, categorías ni personalizaciones. Una muestra incompleta ofrece la ventana de opciones paginadas; nunca se considera completa la muestra de diez variantes del listado.

El precio muestra únicamente la variante seleccionada y su moneda. Agregar utiliza la verificación y el estado compartido del carrito, bloquea solicitudes simultáneas y muestra confirmación o error en la tarjeta. La ventana conserva el desplazamiento y devuelve el foco al control que la abrió; las solicitudes obsoletas se cancelan.

Las imágenes reales usan los derivados de 320/800 px y se muestran completas. Solo hay flechas cuando existen varias variantes y varias imágenes; el deslizamiento dura 280 ms y respeta movimiento reducido. Las fotos pertenecen al producto, no se asocian artificialmente al color elegido. Sin imágenes se muestra un aviso, no arte inventado.

[Contratos visuales](catalog-design.test.ts), [proyección](catalog-view.test.ts), [opciones](client/browser/card-choices.test.ts), [información desde la foto](client/browser/card-info-link.test.ts) y [orquestación](catalog-page.test.ts) complementan la revisión visual. Las pruebas usan fixtures aislados, sin modificar los productos de la base de datos.

### Ampliación de fotos

Las tarjetas comparten un enlace accesible sobre la foto que abre una ventana independiente con la imagen de 1600 px, zoom 2× y desplazamiento por teclado/táctil. Sin JavaScript, abre la imagen directamente. El carrusel notifica la foto activa incluso durante la animación; nunca cambia la variante elegida. Las imágenes fallidas no ofrecen ampliación, y los errores del tamaño grande admiten reintento. Cerrar o Escape conserva el desplazamiento y devuelve el foco.
