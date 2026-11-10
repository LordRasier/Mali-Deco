# Rutas HTML canónicas

[Presentación](../README.md) → [mapa inmutable](storefront-routes.ts) → [módulo permanente](../presentation.module.ts) → controladores de cada funcionalidad.

Nest registra `/`, `/catalogo`, `/productos/:slug`, `/carrito`, `/admin`, `/admin/sections/:section` y el handler protegido de `/checkout` sin flags MVC. Los handlers no conservan alias `__mvc`. Las rutas API siguen bajo `/api/v1`; las exclusiones GET son exactas para no capturar `/admin/orders` o `/admin/settings` de los controladores JSON.

El mapa de links, redirects y formularios es fijo y no depende de Host ni parámetros de usuario. El módulo captura modo y configuración por aplicación, sin lecturas globales tardías. Checkout conserva su elegibilidad local independiente; demo permanece exclusivo de desarrollo.

La navegación usa enlaces y formularios GET nativos. La lista explícita de queries permitidas impide que parámetros ajenos se conviertan en filtros o seleccionen plantillas.

Pruebas: [rutas y prefijos](../../../tests/http/storefront-routing.test.ts), [registro permanente/SEO/assets](../../../tests/http/permanent-presentation.test.ts), [inventario API congelado](../../../tests/http/application-routing.test.ts).