# Código de la aplicación

[Volver al proyecto](../README.md) · [Mapa de rutas](../docs/routes.md)

El arranque está en [main.ts](main.ts) y la composición en [app.module.ts](app.module.ts). Nest sirve HTML y JSON desde una sola aplicación. Ubicar primero la URL en el mapa y seguir su controlador, servicio y prueba; el arranque no contiene lógica de negocio.

- [Módulos de negocio](modules/README.md): contratos JSON, autorización y casos de uso.
- [Presentación](presentation/README.md): páginas, plantillas, clientes DOM y política HTTP.
- [Infraestructura](infrastructure/README.md): conexión y migraciones de base de datos.
- [Pruebas](../tests/README.md): contratos HTTP, clientes, arquitectura e integración autorizada.

Agrupar por funcionalidad y luego por responsabilidad. Los controladores delegan; los servicios de negocio no renderizan vistas; los módulos exportan dependencias explícitas. Las pruebas unitarias acompañan al código; los arneses transversales viven fuera de `src`. Véase [la decisión de organización](../docs/decisions/0001-feature-organization.md).
