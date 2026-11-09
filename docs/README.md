# Guía de documentación

## Encontrar el código

1. [Mapa de rutas](routes.md): URL → controlador → servicio → prueba.
2. [Entrada al código](../src/README.md): presentación, negocio e infraestructura.
3. [Aplicación única y evidencia](rework-completion.md): qué terminó y qué no se verificó.

## Ejecutar y comprobar

- [Inicio](../README.md), [administración](admin-local.md), [validación local](ci.md).
- [MariaDB](mariadb-local.md) y [arnés de checkout](checkout-browser-e2e.md): autorización separada y entorno aislado.
- [Estado de desarrollo](estado-del-desarrollo.md): la reorganización no habilita producción.

## Contratos de negocio

- Catálogo: [API](catalog-public-api.md), [detalle](product-detail.md), [clasificaciones](catalog-taxonomy-admin.md), [medios](product-media-development.md).
- Compra: [carrito](cart-experience.md), [checkout local](checkout-local.md), [cotizaciones](shipping-quote-foundation.md), [Zipnova](zipnova-quote-foundation.md).
- Seguridad: [identidad](identity-status.md), [arquitectura](architecture.md).
- SEO y medición: [configuración, instalación y límites](seo-implementation.md), [análisis inicial](seo-audit-2026-11-08.md).

## Historial y mantenimiento

[Plan original](../tasks/plan.md) · [Tareas](../tasks/todo.md) · [Línea base](migration-baseline.md) · [Retiro de React](renderer-retirement.md) · [Paridad de checkout](checkout-test-retirement.md).

Los informes por etapa conservan evidencia histórica, no instrucciones vigentes. Actualizar README y mapa al cambiar una URL o responsabilidad. Documentar razones y límites; no duplicar código ni crear carpetas vacías.
