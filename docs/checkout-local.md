# Checkout y pedidos de prueba local

Este flujo registra pedidos sintéticos locales con pago y envío **no iniciados**. No crea preferencias de Mercado Pago, no cobra, no genera etiquetas y no reserva stock. No está habilitado para producción.

En API y Next requiere `NODE_ENV=development` y `LOCAL_TEST_CHECKOUT_ENABLED=true`; por defecto está deshabilitado. También requiere la configuración local existente de Zipnova y `ZIPNOVA_OPERATOR_ORIGIN` con el origen exacto del navegador en loopback. Las variables se configuran en los procesos de prueba autorizados, no en el navegador ni en el repositorio. No habilitar el proveedor sin la validación logística y de cuenta descrita en [Zipnova](zipnova-quote-foundation.md).

La sesión de checkout dura hasta 24 horas y usa una cookie HttpOnly SameSite Strict y un token CSRF. La cotización está vinculada a la sesión y vence como máximo a los cinco minutos. Antes de crear un pedido se validan la cotización, destino, opción, punto de retiro, precio, moneda, disponibilidad y dimensiones contra datos del servidor. Una cotización solo puede originar un pedido; una clave UUID de idempotencia identifica el intento. Si una respuesta es incierta, el navegador conserva solamente esa clave en `sessionStorage`; tras recargar consulta el resultado usando la sesión original, sin volver a enviar datos personales. Si la sesión venció o el resultado sigue desconocido, no se inicia automáticamente otro pedido.

Solo se aceptan variantes `made_to_order` en esta prueba, sin prometer disponibilidad, aceptación ni plazo. Las variantes `stock` no tienen cantidades ni reservas implementadas y se rechazan. El pedido conserva una instantánea del catálogo, contacto, destino y servicio; el importe se calcula en unidades menores y una sola moneda. La cotización es una estimación con plazo interno, no una garantía de precio del transportista.

En administración, `owner` y `operations` pueden listar y consultar pedidos y datos de contacto; `catalog` no tiene acceso a pedidos. No hay cambios de estado administrativos, creación automática de administradores ni cuentas predefinidas. No hay purga automática: los datos de prueba permanecen en la base hasta que se establezca una política de retención y limpieza autorizada.

Los controles de origen, Host y proxy restringen este experimento local; no identifican de forma fiable al navegador a partir de la IP de la conexión API y no constituyen seguridad para despliegue público. No registrar datos personales, cookies ni claves de idempotencia.

## Verificación aislada

Las pruebas unitarias y de interfaz usan proveedores simulados. `checkout-validation.integration.ts` solo se ejecuta con la bandera explícita de prueba, `127.0.0.1` y la base exclusiva vacía `store_integration_test`; no debe ejecutarse en paralelo con `catalog.integration.ts`, que usa la misma base. Ambas aplican y revierten migraciones en su esquema verificado, nunca en una base de aplicación.

Antes de cualquier venta real faltan política de disponibilidad y reserva, validación de embalaje y tarifas, retención y privacidad, autenticación y protección de tráfico para producción, y Checkout Pro con reconciliación de pagos y notificaciones autenticadas.
