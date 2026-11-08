# Retiro del renderizador React

La cobertura de comportamiento se conserva en las implementaciones nativas y en las plantillas reales. No se mantiene una segunda aplicación para ejecutar pruebas de componentes que ya no se utilizan.

## Equivalencias verificables

| Prueba retirada | Cobertura vigente |
|---|---|
| Hooks de carrito: escrituras concurrentes, ABA, respuestas tardías, almacenamiento bloqueado y monedas | [Estado del carrito](../tests/client/cart-store.check.ts), [eventos del navegador y filas](../tests/client/cart-dom.check.ts) |
| Hook de producto: selección fuera de página, errores, paginación solapada y respuestas tardías | [Estado del producto](../tests/client/product-state.check.ts), [parser y detalle](../tests/client/product-detail.check.ts) |
| Filas y resumen del carrito | [DOM del carrito](../tests/client/cart-dom.check.ts), [presentación de envío](../tests/client/shipping-panel.check.ts), [superficie única](../tests/client/cart-surface.check.ts) |
| Menú móvil y foco | [Cabecera nativa](../tests/client/site-header.check.ts) |
| Navegación administrativa, roles, hash, formularios retenidos y expiración | [Workspace](../tests/client/admin-browser.check.ts), [DOM](../tests/client/admin-dom.check.ts) |
| Actualización de clasificaciones sin perder selección | [Formulario de producto](../tests/client/admin-product-dom.check.ts), [carga completa](../tests/client/admin-taxonomy.check.ts) |
| Ajustes bloqueados durante escritura y borrador ante incertidumbre | [Ajustes nativos](../tests/client/admin-settings.check.ts) |
| Pedidos solo lectura, roles, errores y separación de datos privados | [Lector](../tests/client/admin-orders-browser.check.ts), [privacidad SSR](../tests/client/orders-privacy.check.ts) |
| Arte editorial y tarjetas React | [Plantillas reales](../tests/client/support/storefront-view.ts), [arte](../tests/client/editorial-art.check.ts), [catálogo](../tests/client/catalog.check.ts) |

Se retiran también las aserciones sobre la composición interna exclusiva de React y su copia transitoria. El carrito ahora mueve **un solo formulario** entre página y diálogo: no duplica controles ni identificadores. Las imágenes se administran desde el producto guardado mediante el widget nativo y sus pruebas de estado, DOM y permisos.

## Alcance de la evidencia

Los dobles DOM prueban contratos de estado, atributos y eventos, no diseño visual ni elegibilidad real para BFCache. Las comprobaciones de navegador complementarias utilizan servicios sintéticos locales: no certifican base de datos, almacenamiento real, pagos ni proveedores externos. El pulido visual se pospuso expresamente.

## Ejecutor de pruebas

`NODE_TEST_CONTEXT=child-v8`, heredado del runner padre, podía hacer que un `node --test` anidado omitiera sus checks con salida exitosa. Los wrappers ahora eliminan exclusivamente esa variable del entorno del hijo. Una [regresión con fallo intencional](../tests/architecture/nested-tests.test.mjs) demuestra ejecución y propagación del error. Los totales históricos de wrappers no prueban por sí solos sus checks internos; la validación final se repite con esta corrección.
