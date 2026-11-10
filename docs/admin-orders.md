# Administración de pedidos

El admin usa superficies blancas sobre gris neutro, tipografía de interfaz y componentes inspirados en los ejemplos locales de Porto (`HTML/master/sass/gui/_cards.scss`, `_forms.scss` y `feature-admin-tables-advanced.html`). La adaptación está limitada al admin: no incorpora los scripts globales de Porto.

## Operación

- La lista muestra número, fecha de Argentina, cliente, pago, pedido, preparación, envío y total. Incluye búsqueda por número/nombre/email/teléfono, filtros y paginación de 20.
- Se consulta el servidor cada 30 segundos cuando la sección está visible y no hay interacción o cambios pendientes. Un formulario en edición no se reemplaza.
- La ficha permite cambiar estados, seguimiento HTTPS y nota interna. Exige un motivo y registra quién hizo el cambio.
- El envío se presenta en un timeline horizontal sobre las tarjetas, con el selector de estado a la derecha y los campos de número y enlace de seguimiento debajo. El recorrido refleja únicamente el estado guardado y una devolución se muestra como excepción, sin asumir una entrega previa.
- Debajo de artículos está la tarjeta de pago con importe del pedido, estado y comprobantes desplegables; el historial desplegable queda inmediatamente después. A la derecha, preparación agrupa estado del pedido, preparación y nota interna sobre cliente y entrega.
- Todos los campos del pedido comparten una barra de guardado que aparece al editar y permanece visible al desplazarse. Exige el motivo y permite guardar o descartar los cambios juntos. El formulario de adjuntos sigue siendo independiente. En móvil el selector pasa debajo del recorrido y las tarjetas se apilan sin desbordar la página.
- Los cobros que tienen un intento de Mercado Pago se verifican con el proveedor; el admin no puede sobrescribirlos. Los registros sin ese intento permiten registrar cobros manuales.
- Despachar exige pago aprobado y preparación completa; completar exige entrega y pago. Estos controles se aplican al cambiar esos estados y permiten seguir anotando un pedido que luego fue reembolsado.
- Actualizar estados no crea guías, devuelve dinero ni repone stock.
- Adjuntos PDF/JPEG/PNG de hasta 2 MB, máximo 20 por pedido. Se guardan en la base con huella SHA-256; repetir el mismo archivo no lo duplica. Descargas privadas, autorizadas y forzadas como archivo.
- El historial presenta los últimos 100 movimientos. Los cambios usan revisión optimista para evitar sobrescribir un pago o una edición concurrente.

## Migraciones

Aplicar con una cuenta de migración autorizada, sobre la misma base configurada. El usuario de aplicación no necesita adquirir permisos DDL permanentemente:

1. `CheckoutPaymentStarts1793361100000` (si está pendiente).
2. `OrderManagement1793361200000`.

Usar el flujo existente de TypeORM: `node --env-file=.env --import tsx node_modules/typeorm/cli.js migration:run -d src/infrastructure/database/data-source.ts`, con las variables de la cuenta de migración exportadas temporalmente en una terminal privada. Las variables exportadas prevalecen sobre `.env`. No poner contraseñas en el repositorio ni compartirlas en el chat.

El esquema usa DDL de MariaDB; inspeccionar el estado si una migración falla. La nueva reversión se niega a descartar historial o adjuntos. Mientras las migraciones estén pendientes, la consulta de los pedidos anteriores se conserva y la ficha indica que la gestión avanzada no está habilitada.

## Mercado Pago S2S

Ruta: `POST /api/v1/payments/mercadopago/webhook`.

El pedido nace una sola vez durante el checkout, antes de redirigir al pago. La notificación actualiza ese mismo pedido por su referencia; no fabrica pedidos a partir de importes enviados por terceros.

La firma HMAC valida `data.id`, `x-request-id` y `x-signature`. Luego se consulta el pago a Mercado Pago y se verifica vendedor, modo, referencia, moneda e importe. La conciliación se serializa por pedido; reintentos no duplican el historial y un estado pendiente no puede deshacer una aprobación, reintegro o contracargo.

Configurar en privado:

- `MERCADOPAGO_WEBHOOK_URL`: URL HTTPS pública de la tienda más la ruta indicada.
- `MERCADOPAGO_WEBHOOK_SECRET`: secreto del panel Webhooks de esa aplicación.
- Las credenciales y banderas de prueba existentes en `.env.example`.

Registrar el evento **Pagos** en el panel de la aplicación y probar una notificación. El código conserva las restricciones existentes de checkout local y vendedor de prueba. Conectar el MCP no configura automáticamente estas credenciales ni habilita cobros reales.

## Validación de este cambio

Pruebas de firma, identidad e importe del proveedor; repetición de notificaciones; estados terminales; versiones concurrentes; filtros parametrizados; validación y privacidad de adjuntos; autorización de roles y CSRF; escape HTML; recuperación del checkout con los nuevos estados; build y TypeScript. Revisión de escritorio y 390 px con datos ficticios aislados.

No se ejecutaron cobros reales. Las dos migraciones se aplicaron el 7 de noviembre de 2026 mediante la cuenta local de migración confirmada por el titular, conservando el pedido previo. El MCP figura registrado pero sus herramientas aún no están expuestas en la conversación activa. Ver [pruebas locales y conexión externa](mercadopago-local.md) para escenarios, túnel y credenciales pendientes.
