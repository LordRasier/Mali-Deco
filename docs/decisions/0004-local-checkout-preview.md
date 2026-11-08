# Checkout compacto exclusivamente para pruebas locales

**Estado: adoptado — 2026-11-07.**

El usuario autorizó volver a recorrer el checkout después del carrito y guardar pedidos de prueba consultables en administración. La tienda publicada continúa como catálogo; esta autorización no habilita pagos ni despachos.

Se reutilizan la página MVC, el estado de checkout y las API existentes. La composición registra las rutas solo con `NODE_ENV=development` y `LOCAL_TEST_CHECKOUT_ENABLED=true`; los controles de origen local, sesión, CSRF, precio, moneda, disponibilidad, vencimiento e idempotencia permanecen. El código postal y la localidad se vuelven a verificar. Una preferencia efímera de entrega puede elegir un único servicio presente en una cotización nueva, nunca imponer un importe o crear un pedido automáticamente.

El checkout local cotiza con medidas numéricas del catálogo y configuración explícita del proveedor, sin exigir ni establecer una declaración de embalaje listo para despachar. Los ejemplos tienen dimensiones ficticias. Cada pedido sigue marcado `testLocal`, con pago, preparación y envío `not_started`; no existe ejecución de esas operaciones. La validación física y la habilitación comercial siguen pendientes para cualquier flujo real.

Mercado Pago se presenta como método previsto **no activo**, sin SDK, credenciales, tarjeta ni redirección. Se descartó conectar cobros reales o simular un pago exitoso durante una revisión visual. Esta solución permite probar contacto, entrega, total y registro sin afirmar que el checkout de producción está listo.

Verificación: 384 pruebas de servidor, 66 envoltorios de cliente y 7 pruebas de arquitectura; tipos, lint y build correctos. Revisión independiente de seguridad sin bloqueos (46 pruebas focalizadas). Navegador: 390/768/1280 px sin desbordamiento, campos de 44 px, localidad y servicio conservados, retiro exige punto, correo obligatorio y doble clic produce un único pedido. Evidencias en `artifacts/checkout-compact/`. Registro y lectura del servicio administrativo verificados en la DB local; pantalla de administración no verificada porque solicitó autenticación. Catálogo y variantes permanecieron intactos.
