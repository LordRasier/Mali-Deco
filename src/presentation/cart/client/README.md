# Cliente del carrito

[Volver al carrito](../README.md) · [Arranque compartido](../../browser/README.md)

El [estado](state/README.md) es el único propietario del ciclo de vida. El [adaptador DOM](browser/README.md) conecta el panel y la página con los [envíos compartidos](../../shipping/client/README.md), sin duplicar stores ni claves de almacenamiento.

Recorrido: plantilla → adaptador → [store](state/cart-store.ts) → [runtime](state/cart-runtime.ts) / [resolución autoritativa](../../shared/cart/cart-resolution.ts) → snapshot → controles nativos. No hay acceso a base de datos ni llamadas directas a proveedores de envío en este cliente.
