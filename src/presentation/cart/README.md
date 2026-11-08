# Página y panel de carrito MVC

[Volver a presentación](../README.md) · [Cliente compartido](client/README.md)

`GET /carrito` se registra permanentemente. El [controlador](cart.controller.ts) rechaza cualquier query y renderiza la [plantilla](views/cart.hbs) con locales propios. El [origen de datos](cart-mode.ts) es fijo: catálogo real. `STOREFRONT_MODE` está retirado; ni variables antiguas ni atributos HTML pueden seleccionar demostración. Se conserva el sufijo `api` del almacenamiento para mantener el carrito real existente sin importar artículos sintéticos.

[CartPage](cart-page.ts) obtiene la marca con fallback sin ocultar el carrito. El resumen conserva los cálculos y dirige los pedidos a Instagram por defecto. Con opt-in explícito de desarrollo muestra «Continuar al checkout» para pedidos locales de prueba; nunca activa pagos o envíos. La página muestra el contenido del parcial; al abrir el panel se mueve el mismo árbol sin perder campos. [Evidencia T12](../../../docs/cart-page-migration.md).

La página no lee cookies de checkout, no escribe en la base y no recibe formularios. El navegador usa los contratos JSON existentes. Los assets públicos están separados de las vistas: [CSS](public/cart.css) y cliente generado, publicados bajo `/assets/storefront`. La CSP admite scripts externos del mismo origen, pero no scripts/handlers inline. Carrito conserva `noindex` en todos los modos.

## Generación y ejecución

Desde la raíz, `npm run build:browser` genera el cliente. `dev`, `build` y `test` lo ejecutan antes de continuar y se detienen si falla. Después de editar el cliente de navegador durante un `dev` ya iniciado, repetir `build:browser` y recargar; no se añadió otro servidor/watch permanente.

El bundle generado se ignora en Git. El build copia explícitamente plantilla, CSS y JS a `dist`; la ejecución compilada usa ese artefacto. El cliente vive en [client](client/README.md) y los contratos reutilizados en [shared](../shared/README.md).

Las pruebas están en [MVC HTTP](../../../tests/http/mvc-pilot.test.ts), [modo](cart-mode.test.ts) y [assets](../../../tests/http/view-assets.test.ts). La [cotización compartida](../../../docs/shipping-mvc-migration.md) ya está conectada; sus pruebas de navegador usan respuestas sintéticas y no habilitan proveedores reales.
