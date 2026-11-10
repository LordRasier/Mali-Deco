# Emails de pedidos · EnvíaloSimple

Compra confirmada (pago aprobado), despacho (`shipped`) y entrega (`delivered`). Los eventos manuales y los verificados por Mercado Pago generan una fila en `order_email_outbox` dentro de la misma transacción que cambia el pedido. Una restricción única por pedido/etapa impide duplicados. Los pedidos anteriores no se reproducen automáticamente al activar el servicio.

## Configuración

1. Aplicar `npm run migration:order-emails`. Para esta instalación de desarrollo, está disponible `npm run migration:order-emails:local-root`: usa root sin contraseña solo dentro del proceso, en localhost y desarrollo. No modifica usuarios ni permisos.
2. Definir las variables de `.env.example`. En desarrollo se lee la clave del archivo privado `envialosimple` mediante `ENVIALOSIMPLE_API_KEY_FILE`; en producción usar `ENVIALOSIMPLE_API_KEY`. Nunca incluir la clave en Git, HTML, logs ni URLs.
3. Empezar con `ORDER_EMAIL_MODE=test` y `ORDER_EMAIL_TEST_TO` apuntando a un correo propio. Se redirigen todos los avisos nuevos a esa dirección y se agrega `[PRUEBA]` al asunto. Sin destinatario o sin clave no se despacha nada. `disabled` no crea avisos nuevos. `live` usa el email del cliente y omite pedidos `testLocal`.
4. Ejecutar `npm run emails:check` para comprobar la tabla, la clave y el dominio, sin enviar correos. Reiniciar `npm run dev` al cambiar variables. El dominio del remitente debe estar verificado en EnvíaloSimple.
5. Crear un pedido nuevo, aprobar el pago, preparar/despachar y marcar entregado. Revisar el destinatario y los tres mensajes. En Pedidos → detalle → Actualizar datos se consultan los resultados. Solo después de validar el envío real, activar `live` en producción.

Para recibir primero los tres ejemplos con datos ficticios, ejecutar `npm run emails:test` desde una terminal con acceso a MariaDB y a la API. Requiere modo test, destinatario configurado y migración aplicada; no modifica pedidos ni inventario. Conserva los identificadores en `.local-tools/email-tests/` (privado, fuera de Git). Si ya existe una prueba, vuelve a mostrar sus resultados sin reenviar; `npm run emails:test -- --new-run` pide explícitamente otros tres ejemplos, luego de revisar cualquier resultado incierto. `npm run emails:test -- --dry-run` valida la configuración local sin conexiones ni envíos. Después, reiniciar `npm run dev` para que el servidor tome las variables nuevas.

El remitente propuesto es `pedidos@mali-store.com.ar`. La API autoriza el envío desde el dominio, pero **no crea una casilla para recibir respuestas**. Usar `ORDER_EMAIL_REPLY_TO` cuando exista una casilla atendida. Los botones usan `https://mali-store.com.ar` (configurable); ese sitio debe estar publicado para que los enlaces funcionen. En local el banner sí funciona: se adjunta como JPEG inline/CID, usando la imagen y el color configurados.

## Procesamiento y estados

El worker consulta la cola cada 15 segundos. Antes del POST reclama la fila con una actualización condicional y verifica el dominio. La llamada HTTPS usa el endpoint oficial, Bearer, timeout y no sigue redirecciones. El pedido no espera una respuesta externa dentro de su transacción.

| Estado en el admin | Evidencia |
| --- | --- |
| No enviado | No existe un aviso en la cola para esa etapa. |
| En cola | Aviso persistido, aún no despachado. |
| Enviando | Un proceso reclamó el aviso. |
| Aceptado | La API devolvió un identificador que quedó guardado. |
| Enviado | El proveedor informa `sent`; se conserva la fecha del evento. No implica lectura. |
| Falló | Rechazo HTTP conocido, destinatario inválido o rechazo/exclusión del proveedor. |
| Revisar | Resultado incierto: timeout, conexión cortada, respuesta no reconocida o proceso interrumpido. |
| Sin confirmar | Aceptado, sin poder confirmar entrega durante 24 horas. |
| Omitido | Pedido de prueba en modo live, cancelado o pago ya no aprobado. |

Se consulta el detalle de los correos aceptados cada dos minutos, sin necesitar un túnel ni un webhook público. Las consultas GET se pueden repetir; un POST con resultado incierto **nunca se repite automáticamente**. También se detienen los rechazos conocidos: revisar remitente, créditos, exclusiones y destinatario antes de decidir un reenvío. No se garantiza exactly-once externo porque el proveedor no documenta una clave de idempotencia. Para casos inciertos consultar EnvíaloSimple usando pedido/etapa y `user_variables.notification_id`; no cambiar manualmente la fila a `queued` sin verificar que el mensaje no fue aceptado.

El identificador de la respuesta de envío aún debe validarse con una llamada real de esta cuenta: la documentación de envío no incluye un ejemplo de respuesta de éxito. Un formato desconocido queda en «Revisar», nunca como éxito ni se reenvía. Se implementaron las formas `id` y `payload.id`/`payload[0].id`; un ensayo real permitirá ajustar el contrato si fuera necesario.

## Datos y vistas previas

La cola conserva una proyección inmutable del pedido con nombre/email, entrega, artículos, importes y seguimiento. Omite DNI, teléfono, credenciales, comprobantes y notas internas. El diseño incluye HTML adaptable y texto plano. Las credenciales solo existen en el servidor.

Configuración → Emails y la lista de etapas conservan las vistas previas privadas para owner/operations. Abrirlas no escribe en la base ni envía correos. La lista de vistas previas proyecta eventos del pedido; el estado real se obtiene exclusivamente de la outbox en el detalle y queda también en el historial al aceptar/enviar.

Pruebas: `node --import tsx --test src/modules/order-emails/order-emails.test.ts src/modules/order-emails/email-delivery.test.ts`. Cubren plantillas, contenido seguro, modo test/live, deduplicación, reclamo concurrente, timeout, pérdida de confirmación en DB, estados del proveedor y banner JPEG.

Documentación oficial: [enviar emails](https://soporte.donweb.com/es/articles/16040497-envialosimple-transaccional-api-enviar-emails), [detalle de email](https://soporte.donweb.com/es/articles/16040360-envialosimple-transaccional-api-detalle-de-un-email), [dominios](https://soporte.donweb.com/es/articles/16038869-envialosimple-transaccional-api-datos-generales-del-dominio).
