# Arranque de clientes de plantillas

[Volver a presentación](../README.md)

[browser.ts](browser.ts) inicia los adaptadores necesarios para las plantillas Nest: [cabecera](site-header.ts), carrito/cotización, filtros y [producto](../products/client/README.md) cuando están presentes. No es otra aplicación ni contiene reglas de negocio. El build genera un solo bundle auditado; las páginas siguen llegando como HTML del servidor.
