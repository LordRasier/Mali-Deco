# Contratos compartidos del cliente

[Volver a presentación](../README.md) · [Arranque de navegador](../browser/README.md)

Estos módulos reúnen contratos, transportes JSON y coordinadores reutilizados por los clientes nativos. No son otra aplicación ni una capa de acceso a base de datos. Los transportes se ejecutan al invocarlos, no al importar el módulo.

| Grupo | Entrada y responsabilidad |
| --- | --- |
| Catálogo | [api-catalog](catalog/api-catalog.ts), queries, filtros, datos demo explícitos y tipos de presentación |
| Carrito | [cart-resolution](cart/cart-resolution.ts), almacenamiento y operaciones puras |
| Producto | [product-selection](products/product-selection.ts): selección URL y resolución de un par producto/variante |
| Envíos | [shipping-session](shipping/shipping-session.ts): destino, solicitudes, selección y vencimiento |
| Checkout | [checkout-client](checkout/checkout-client.ts): transporte y respuesta; el intento pertenece al store de checkout |
| Runtime | [data-mode](runtime/data-mode.ts): modo validado, sin fallback por una API caída |

Las reglas puras canónicas están en [catalog/shared](../catalog/shared/README.md); los módulos que las reexportan no crean otra implementación. No importar módulos de servidor, secretos ni acceso a base de datos desde un cliente. Los stores por funcionalidad controlan montaje, descarte de respuestas tardías y limpieza; compartir transporte no autoriza un singleton de sesión entre usuarios.
