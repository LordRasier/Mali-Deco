# Módulos de negocio

[Volver al código](../README.md) · [Composición](../app.module.ts)

Cada módulo conserva sus contratos JSON bajo `/api/v1` y exporta solo los servicios que otros módulos necesitan. La [presentación HTML](../presentation/README.md) consume esas instancias: no duplica providers, conexiones ni reglas de autorización.

- [Catálogo](catalog/README.md): lectura pública, productos, variantes, clasificaciones y resolución de carrito.
- [Identidad](identity/README.md): sesión, roles, origen y CSRF.
- [Checkout](checkout/README.md) y [pedidos](orders/README.md): operaciones locales, confirmación e idempotencia.
- [Envíos](shipping/README.md): destino, cotizaciones e integraciones acotadas.
- [Medios](media/README.md): validación, procesamiento y persistencia de imágenes.
- [Configuración](settings/README.md): marca y opciones públicas/administrativas.
- [Pagos](payments/README.md): frontera existente; no habilita cobros por servir HTML.
- [Emails de pedidos](order-emails/README.md): plantillas y bandeja de prueba local; sin envío externo habilitado.

Ejecutar `npm run test:server` desde la raíz para pruebas sin infraestructura. Las pruebas de integración, migraciones, bootstrap y llamadas a proveedores requieren autorización y entorno aislado; reorganizar el código no concede esa autorización.
