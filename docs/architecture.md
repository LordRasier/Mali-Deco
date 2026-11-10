# Decisiones para próximas entregas

La base adopta un monolito modular NestJS, MariaDB 10.4 con InnoDB como objetivo de desarrollo y presentación Handlebars dentro del mismo proceso. Las migraciones y el catálogo HTTP pasaron pruebas reales aisladas; véase [compatibilidad MariaDB](mariadb-local.md). Las fronteras previstas son identidad, catálogo, inventario, checkout, pedidos, pagos, envíos, medios, ajustes y auditoría. Crear módulos al implementar funcionalidad, no como capas vacías. La API conserva `/api/v1`. Las páginas usan servicios mediante inyección; los clientes usan JSON del mismo origen, no entidades ORM. OpenAPI y generación de clientes no forman parte de este rework.

## Pedidos, dinero y stock

El dinero se expresa en unidades menores enteras y moneda; no usar flotantes. Conservar snapshots inmutables de artículos, dirección y envío en el pedido. Las reservas de stock por SKU deben usar transacciones y bloqueos en orden estable, sin llamadas de red dentro de la transacción. Un pago tardío con reserva liberada requiere incidencia, no sobreventa. Un inbox/outbox durable en MariaDB permitirá procesar eventos de manera recuperable.

## Pagos

Usar exclusivamente Checkout Pro mediante Preferences, no mezclar con Orders API. Modelo previsto: Order → CheckoutAttempt(s)/Preference(s) → Payment(s); el identificador del pago de proveedor es único globalmente, no por pedido. Dos aprobaciones completas requieren una incidencia de sobrepago. Si ocurre split, conciliar la colección merchant_order y validar su suma antes de preparar el envío. No se verificó una opción para deshabilitar split; no inventarla. El vencimiento de una preferencia y el de un pago son conceptos distintos.

Implementar idempotencia propia, una intención durable y conciliación antes de reintentar un timeout incierto; no asumir soporte de `X-Idempotency-Key` para Preferences. Para envío, `shipments.cost` con `mode=not_specified` debe cobrarse una sola vez. [Creación de preferencia](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post), [notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/payment-notifications). Ninguna integración está implementada aún.

## Envío y administración

Andreani requiere un puerto `ShippingQuoteProvider`; su esquema productivo no está verificado. Un eventual mock será explícito y estará prohibido en producción. La cotización debe vincular carrito, destino y origen, embalaje, servicio y política; usar gramos y milímetros internamente. Un error de cotización nunca equivale a envío gratis.

La administración ya usa sesiones opacas HttpOnly (Secure en producción), CSRF y autorización en la API; no guarda tokens en localStorage ni crea una cuenta productiva predeterminada. Véase [administración local](admin-local.md). La entrada pública y su política de IP/límites siguen pendientes. Argentina/ARS y las modalidades de stock o encargo requieren confirmación comercial antes de vender.

El flujo existente usa Andreani para resolver localidades y Zipnova para cotizar en desarrollo local explícito; no crea envíos. Hay pedidos locales con snapshots e idempotencia, pero no reservas, inbox/outbox ni conciliación de pagos. Estas restricciones futuras no deben confundirse con funcionalidades terminadas.
