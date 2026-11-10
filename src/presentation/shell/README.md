# Cabecera y pie del escaparate

La estructura y los textos ahora se generan desde `store_content_settings`. Beneficios y columnas pueden ordenarse; los grupos vacíos desaparecen y la grilla se adapta. Los interruptores de páginas/funciones controlan también rutas, sitemap y enlaces internos. Ocultar una columna solo afecta su presentación. [Configuración y despliegue de otro clon](../../../docs/store-content.md).

El footer agrupa marca, Tienda, Te ayudamos e Información en una grilla de cuatro columnas; se redistribuye en tablet y móvil. Incluye preparación de 1 a 3 días, envíos y ayuda para elegir. Mantiene los colores de `theme.css`, enlaces con foco visible y contacto opcional definido en [información pública](../information/store-information.ts). La franja inferior muestra año, identidad fiscal si está configurada y el enlace a la explicación de arrepentimiento. No se presenta un botón de solicitud sin backend.

WhatsApp e Instagram se muestran bajo el texto de marca, en botones circulares de 44 px con SVG locales, centrados y con nombres accesibles. Abren el chat/perfil en otra pestaña con `noopener noreferrer`; no cargan scripts de terceros ni envían mensajes. Se ocultan individualmente al guardar su valor vacío en Configuración. El email, si existe, conserva su enlace separado.

[Presentación](../README.md) → [parciales](views/README.md) → [CSS](public/shell.css) → [interacción](../browser/site-header.ts).

Portada, catálogo y producto comparten marca y acceso al carrito. La navegación contiene únicamente «Ver Productos», centrado entre dos columnas laterales iguales en escritorio. En móvil ocupa una segunda fila centrada, siempre visible con o sin JavaScript; no hay menú desplegable. La búsqueda está retirada temporalmente: no se renderizan su botón ni formulario. El inicializador admite su ausencia sin impedir el carrito; su comportamiento accesible queda disponible para una futura reactivación.

El acceso al carrito usa un SVG de bolsa con contador, área de 44×44 px y nombre accesible con la cantidad exacta. Es navegación secundaria, no una acción de pago. El cliente actualiza solo el contador y `aria-label`, nunca reemplaza el árbol del botón. Sin JavaScript permanece deshabilitado; no se promete una lectura del almacenamiento que no ocurrió.

El [registro de vistas](../configure-http.ts) carga los parciales privados una vez por aplicación. [Prueba de foco/disclosures](../../../tests/client/site-header.check.ts) y [HTTP](../../../tests/http/home-mvc.test.ts).

Fuentes: [Nest MVC](https://docs.nestjs.com/techniques/mvc), [ARIA expanded](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded).
