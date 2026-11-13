# Checkout: pago, recuperación y reservas

El método de pago se elige en el paso 03. Mercado Pago queda seleccionado cuando está disponible. El botón `Pagar $total` requiere contacto, domicilio y entrega válidos; guarda el pedido e inicia su preferencia, y navega en la misma pestaña. Son dos operaciones autenticadas e idempotentes coordinadas por una sola acción del cliente.

## Despliegue

Con las migraciones anteriores aplicadas, ejecutar antes de reiniciar la aplicación:

```sh
git pull
npm ci
npm run migration:checkout
npm run build
# Reiniciar el proceso PM2 habitual de esta tienda.
```

La migración `1793362700000` crea `checkout_order_reservations`. No modifica pedidos históricos ni reconstruye movimientos de stock. El rollback se rechaza para preservar evidencia. En el entorno local autorizado con MariaDB root sin contraseña, usar `npm run migration:checkout:local-root`.

## Recuperación y seguridad

- Se conserva únicamente la clave opaca del intento en `sessionStorage`. El contacto, DNI y domicilio permanecen en memoria o en el pedido del servidor; no se guardan en almacenamiento del navegador.
- Volver o recargar consulta el pedido con la sesión original, CSRF y clave de idempotencia. La respuesta privada `no-store` incluye el borrador y los artículos originales. Otro comprador no puede recuperarlos con solo conocer un ID o clave.
- `/checkout/return` ignora todos los parámetros del proveedor y navega a `/checkout`; esa navegación desde el propio sitio permite recuperar la cookie `SameSite=Strict`. El servidor consulta Mercado Pago para conocer el estado real.
- Mercado Pago recibe `auto_return: approved`. En otros resultados, el regreso también depende de que el comprador use la opción de volver a la tienda. No se interpreta un parámetro `status=approved` como confirmación.
- Si falla la verificación previa al POST de preferencia, `PAYMENT_NOT_STARTED` permite reintentar el mismo pedido. Si el resultado del POST es incierto, no se repite automáticamente.
- Un rechazo permite reusar la misma preferencia mientras siga vigente. Antes de ofrecerla otra vez se consulta el estado: un pago pendiente o aprobado no vuelve a mostrar un enlace para pagar.
- Los datos del pedido quedan bloqueados después de crearlo. Cambiar artículos, domicilio o importe de una operación ya iniciada requiere resolverla y comenzar otra compra.

## Reservas

Al crear un pedido nuevo se guarda, en su misma transacción, qué stock se descontó. La reserva vence a los 30 minutos; su preferencia tiene el mismo límite. Un trabajador revisa hasta 20 reservas por minuto y reprograma las que requieren revisión para evitar que bloqueen la cola.

| Situación | Resultado |
| --- | --- |
| Sin intento de preferencia, vencido y sin preparación/envío | Cancela el pedido y devuelve el stock una vez. |
| Preferencia creada | Espera además 15 minutos y exige vencimiento confirmado por Mercado Pago y consulta sin pago activo, o solo rechazado/cancelado. |
| Pendiente, incierto, proveedor inaccesible o evidencia incompleta | Conserva la reserva. Requiere verificación posterior o revisión del operador. |
| Aprobado, devolución, disputa o contracargo | No libera stock automáticamente. |
| Aprobación tardía de un pedido ya cancelado | Muestra revisión requerida, registra el movimiento, mantiene la cancelación y evita el email normal de compra. El operador resuelve entrega con una nueva reserva o reembolso. |
| Pedido de prueba o producto sin stock limitado | Registra la vigencia sin descontar ni devolver stock real. |
| Pedido anterior a esta migración | Conserva su comportamiento anterior; no tiene liberación automática. |

La liberación usa bloqueos transaccionales compartidos con pagos y administración. No depende de que el comprador siga en la página. Un pedido cuya reserva fue liberada no se puede reabrir manualmente sin una nueva compra. No hay reembolsos automáticos.

## Verificación

Pruebas focalizadas de cliente, controlador, proveedor, emails y pedidos; integración con esquema MariaDB temporal y proveedores sintéticos mediante `node scripts/test-payment-environments.mjs --local-root`; recorrido Chrome con todas las solicitudes interceptadas mediante `node tests/journeys/checkout-payment.mjs` (requiere Playwright/Chromium, configurables con `PLAYWRIGHT_CORE_PATH` y `CHROMIUM_EXECUTABLE`). El recorrido comprueba selección, pago, vuelta con parámetros falsos, rechazo, recarga, reintento y aprobación, además de tamaños 1280/390 px. No realiza cobros reales.
