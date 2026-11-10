# Interacción del detalle MVC

[Producto](../README.md) → [product-panel.ts](product-panel.ts) → [store](../state/product-store.ts). [product-gallery.ts](product-gallery.ts) conserva el orden del servidor, teclado y placeholder de imágenes rotas.

- Parsear el atributo de bootstrap mediante el [parser público](../../../shared/catalog/api-catalog.ts), no confiar en un cast de JSON.
- Botones keyed preservan foco; selección validada, carrito listo y paginación coherente son necesarios para agregar.
- `pagehide/pageshow` suspenden/reanudan el store; una operación completada tarde no abre el panel ni añade artículos de una generación anterior.
- Color validado se asigna a una propiedad CSSOM, no a `style`/`cssText`. [Contrato CSP de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr).

Desde la raíz: `node --import tsx --test tests/client/product-state.check.ts tests/client/product-bootstrap.check.ts`. [Pruebas de navegador](../../../../../docs/product-mvc-migration.md).
