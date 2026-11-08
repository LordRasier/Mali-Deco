# Estado del desarrollo

Este repositorio contiene una base de tienda en desarrollo; **no está lista para producción ni para recibir datos o ventas reales**.

- El rework usa una aplicación NestJS MVC: páginas, assets y API del mismo origen, sin Next/React ni workspaces. Véase [evidencia y límites](rework-completion.md).
- El storefront público tiene un único origen de datos: el catálogo persistido. `STOREFRONT_MODE` está retirado y no puede activar una demostración. Sin base se informa indisponibilidad; no se reemplazan errores con productos ficticios. Los recursos editoriales no representan inventario y las pruebas usan dobles explícitos.
- Catálogo público y administrativo, identidad, sesiones, clasificaciones e imágenes están implementados. El administrador tiene secciones por rol, enlaces directos y conservación de formularios al cambiar de sección. Véase [administración local](admin-local.md).
- El carrito valida artículos y precios con la API. Existe cotización local con Zipnova y resolución postal con Andreani; ambas dependen de activación explícita. Cotizar no crea un envío.
- La tienda funciona como catálogo y recibe pedidos por Instagram. El checkout no está expuesto en desarrollo ni en producción. Su flujo de prueba permanece en el arnés aislado; el panel conserva la consulta autorizada de pedidos existentes.
- Faltan pagos reales, inventario/reservas, operación del pedido, creación y seguimiento de envíos y preparación del despliegue público.
- Pasaron pruebas locales seleccionadas con MariaDB y recorridos administrativos en navegador, detallados en [la evidencia del corte](admin-local.md#evidencia-y-límites-del-corte). No constituyen una validación integral para producción. Revisar migraciones, seguridad y operaciones antes de cualquier uso real.
- La imagen de [diseño aprobada](design/propuesta-tienda-3d-color-desktop-mobile.webp) documenta la propuesta visual coral, azul cobalto y crema para escritorio y móvil. Es una conversión WebP sin pérdida de la imagen aprobada; el arte de demostración no es inventario.

Ver también el [README principal](../README.md), [la documentación del storefront](../README.md) y [el estado de identidad](identity-status.md).
