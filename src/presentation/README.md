# Presentación HTML permanente

[Volver al código](../README.md) · [Rutas inmutables](routing/README.md)

[applicationModule](../app.module.ts) siempre incorpora [PresentationModule](presentation.module.ts). No hay flags de habilitación de HTML ni rutas de preview. El módulo captura la configuración de presentación al arrancar; [configureHttp](configure-http.ts) registra vistas y assets sin releer esa selección. `AppModule` conserva la composición API independiente y su inventario de 50 contratos.

## Recorridos

- `/` → [portada](home/README.md); `/catalogo` → [catálogo](catalog/README.md); `/productos/:slug` → [producto](products/README.md).
- `/carrito` → [página y panel compartidos](cart/README.md).
- `/admin` y `/admin/sections/:section` → [acceso y administración](admin/README.md), conservando los hashes de navegación existentes.
- `/checkout` no se publica; el [checkout experimental](checkout/README.md) se monta solo en pruebas aisladas.

Las exclusiones del prefijo `/api/v1` son GET y paths exactos; nunca `admin/*`. El transporte JSON, cookies, CSRF, permisos y contratos de base no cambian. Nest sirve HTML y JSON desde una sola aplicación.

El [arranque de navegador](browser/README.md) monta los clientes de cada funcionalidad. Los [contratos compartidos](shared/README.md) agrupan transportes y reglas reutilizadas; no duplican servicios de negocio. Administración tiene su [cliente y bundle propios](admin/client/README.md).

## Seguridad y configuración

- API es el modo predeterminado. Demo solo se acepta explícitamente en desarrollo y nunca reemplaza una API caída. [Política](presentation-policy.ts).
- Las páginas públicas API correctas son indexables. Demo, errores, administración, carrito y checkout sí lo conservan. Canonical de producto usa solo `PUBLIC_SITE_URL` validado, nunca Host.
- El [motor](view-engine.ts) es independiente por aplicación, escapa texto y bloquea miembros heredados. No es un sandbox para getters ni plantillas no confiables.
- Plantillas fijas y modelos proyectados: nunca propagar query/body o configuración privada a los locales. No hay scripts inline; los bundles son del mismo origen.
- [Assets](static-assets.ts) permite solo archivos declarados y GET/HEAD bajo `/assets/storefront`, `/assets/admin`, `/assets/checkout` y `/storefront`. README, fuentes, mapas, dotfiles y traversal no son públicos.

## Verificación

[HTTP permanente](../../tests/http/permanent-presentation.test.ts), [contratos API](../../tests/http/application-routing.test.ts), [límites de assets y rutas retiradas](../../tests/http/mvc-pilot.test.ts), [política](presentation-policy.test.ts) y [motor/layout/escape](view-engine.test.ts) mantienen cobertura independiente. Las pruebas HTTP usan loopback y servicios sintéticos; no prueban una base productiva ni autorizan despliegues. El [build](../../scripts/README.md) copia únicamente su manifiesto explícito de vistas y assets.
