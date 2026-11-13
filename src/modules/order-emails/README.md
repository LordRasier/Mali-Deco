# Emails de pedidos · EnvíaloSimple

Compra confirmada (pago aprobado), despacho (`shipped`) y entrega (`delivered`). Los eventos manuales y los verificados por Mercado Pago generan una fila en `order_email_outbox` dentro de la misma transacción que cambia el pedido. Una restricción única por pedido/etapa impide duplicados. Los pedidos anteriores no se reproducen automáticamente al activar el servicio.

## Configuración

1. Aplicar `npm run migration:order-emails`. Para esta instalación de desarrollo, está disponible `npm run migration:order-emails:local-root`: usa root sin contraseña solo dentro del proceso, en localhost y desarrollo. No modifica usuarios ni permisos.
2. Definir las variables de `.env.example`. Tanto en desarrollo como en producción se admite `ENVIALOSIMPLE_API_KEY_FILE=./envialosimple`: el archivo contiene únicamente la clave, sin `NOMBRE=`, y la ruta relativa se resuelve desde el directorio de trabajo del proceso. Una `ENVIALOSIMPLE_API_KEY` no vacía tiene prioridad; si está vacía se utiliza el archivo. Un archivo configurado pero ilegible o inválido detiene el inicio con un error sin revelar su contenido ni su ruta. Conservar el archivo privado y fuera de Git. Nunca incluir la clave en HTML, logs ni URLs.
3. `ORDER_EMAIL_MODE=live` envía las ventas reales al correo del comprador. Los pedidos `testLocal` generan avisos de modo `test`, que el mismo worker procesa hacia `ORDER_EMAIL_TEST_TO` con `[PRUEBA]` en el asunto. Sin destinatario de pruebas permanecen en cola y nunca se usa como alternativa el correo del comprador. `test` redirige todos los avisos nuevos al destinatario de pruebas; `disabled` no crea avisos nuevos.
4. Ejecutar `npm run emails:check` para comprobar la tabla y consultar la API, sin enviar correos. Informa si la clave se tomó de la variable directa o del archivo. En producción, conservar el directorio de trabajo y la carga de `.env` del proceso PM2; después de actualizar y compilar, reiniciar el proceso existente con `--update-env`. No requiere una migración nueva. Un aviso `test/queued` de un pedido de prueba ya existente también puede procesarse en `live`, siempre que exista `ORDER_EMAIL_TEST_TO`; no se convierten avisos ni se reintentan entregas fallidas o inciertas.
5. Con Mercado Pago en pruebas, aprobar un pedido y comprobar su confirmación real en el destinatario de pruebas, en EnvíaloSimple y en Pedidos → detalle → Actualizar datos. No hace falta cambiar los emails de `live` a `test`. Los pedidos de prueba siguen sin permitir despachos reales. Para ventas reales, los cambios de despacho/entrega generan las otras etapas.

Para recibir primero los tres ejemplos con datos ficticios, ejecutar `npm run emails:test` desde una terminal con acceso a MariaDB y a la API. Requiere modo test, destinatario configurado y migración aplicada; no modifica pedidos ni inventario. Conserva los identificadores en `.local-tools/email-tests/` (privado, fuera de Git). Si ya existe una prueba, vuelve a mostrar sus resultados sin reenviar; `npm run emails:test -- --new-run` pide explícitamente otros tres ejemplos, luego de revisar cualquier resultado incierto. `npm run emails:test -- --dry-run` valida la configuración local sin conexiones ni envíos. Después, reiniciar `npm run dev` para que el servidor tome las variables nuevas.

El remitente propuesto es `pedidos@mali-store.com.ar`. La API autoriza el envío desde el dominio, pero **no crea una casilla para recibir respuestas**. Usar `ORDER_EMAIL_REPLY_TO` cuando exista una casilla atendida. Los botones usan `https://mali-store.com.ar` (configurable); ese sitio debe estar publicado para que los enlaces funcionen. En local el banner sí funciona: se adjunta como JPEG inline/CID, usando la imagen y el color configurados.

## Procesamiento y estados

El worker consulta la cola cada 15 segundos. Antes del POST reclama la fila con una actualización condicional y valida el destinatario y el estado actual del pedido. Envía directamente a `/mail/send`, como el SDK oficial; ese endpoint autentica la clave y autoriza el dominio del remitente. La consulta adicional `/domains` es solo un diagnóstico: su 404 no bloquea ni prueba un envío. La llamada HTTPS usa Bearer, timeout y no sigue redirecciones. El pedido no espera una respuesta externa dentro de su transacción.

| Estado en el admin | Evidencia |
| --- | --- |
| No enviado | No existe un aviso en la cola para esa etapa. |
| En cola | Aviso persistido, aún no despachado. |
| Pausado | Sigue en cola, pero su modo no está activo, falta el destinatario de pruebas o los envíos están desactivados. |
| Enviando | Un proceso reclamó el aviso. |
| Aceptado | La API devolvió un identificador que quedó guardado. |
| Enviado | El proveedor informa `sent`; se conserva la fecha del evento. No implica lectura. |
| Falló | Rechazo HTTP conocido, destinatario inválido o rechazo/exclusión del proveedor. |
| Revisar | Resultado incierto: timeout, conexión cortada, respuesta no reconocida o proceso interrumpido. |
| Sin confirmar | Aceptado, sin poder confirmar entrega durante 24 horas. |
| Omitido | Pedido cancelado, pago ya no aprobado o aviso cuyo modo no corresponde al pedido. |

Se consulta el detalle de los correos aceptados cada dos minutos, sin necesitar un túnel ni un webhook público. Las consultas GET se pueden repetir; un POST con resultado incierto **nunca se repite automáticamente**. También se detienen los rechazos conocidos: revisar remitente, créditos, exclusiones y destinatario antes de decidir un reenvío. No se garantiza exactly-once externo porque el proveedor no documenta una clave de idempotencia. Para casos inciertos consultar EnvíaloSimple usando pedido/etapa y `user_variables.notification_id`; no cambiar manualmente la fila a `queued` sin verificar que el mensaje no fue aceptado.

`npm run emails:check` muestra los totales de la cola por modo/estado/entorno del pedido e identifica qué pruebas pueden procesarse en `live`. La consulta distingue HTTP 401/403/429, DNS, TLS, timeout, respuestas inválidas y dominio ausente/no verificado. Un 404 de `/domains` se informa como comprobación no disponible, no como clave inválida; el comando no valida entonces `/mail/send` y termina con código distinto de cero. No imprime la clave ni respuestas crudas del proveedor y no modifica la cola. Una configuración completa no prueba la entrega. Los tres ejemplos de `emails:test` son envíos independientes con datos ficticios y tampoco prueban el flujo de un pedido.

El identificador de la respuesta de envío aún debe validarse con una llamada real de esta cuenta: la documentación de envío no incluye un ejemplo de respuesta de éxito. Un formato desconocido queda en «Revisar», nunca como éxito ni se reenvía. Se implementaron las formas `id` y `payload.id`/`payload[0].id`; un ensayo real permitirá ajustar el contrato si fuera necesario.

## Datos y vistas previas

La cola conserva una proyección inmutable del pedido con nombre/email, entrega, artículos, importes y seguimiento. Omite DNI, teléfono, credenciales, comprobantes y notas internas. El diseño incluye HTML adaptable y texto plano. Las credenciales solo existen en el servidor.

Configuración → Emails y la lista de etapas conservan las vistas previas privadas para owner/operations. Abrirlas no escribe en la base ni envía correos. La lista de vistas previas proyecta eventos del pedido; el estado real se obtiene exclusivamente de la outbox en el detalle y queda también en el historial al aceptar/enviar.

Pruebas: `node --import tsx --test src/modules/order-emails/order-emails.test.ts src/modules/order-emails/email-delivery.test.ts`. Cubren plantillas, contenido seguro, modo test/live, deduplicación, reclamo concurrente, timeout, pérdida de confirmación en DB, estados del proveedor y banner JPEG.

Documentación oficial: [enviar emails](https://soporte.donweb.com/es/articles/16040497-envialosimple-transaccional-api-enviar-emails), [detalle de email](https://soporte.donweb.com/es/articles/16040360-envialosimple-transaccional-api-detalle-de-un-email), [dominios](https://soporte.donweb.com/es/articles/16038869-envialosimple-transaccional-api-datos-generales-del-dominio).
