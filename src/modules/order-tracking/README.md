# Seguimiento de pedidos

`/seguimiento` permite solicitar un enlace con el correo de la compra. El correo de acceso abre la misma página con un token aleatorio de 256 bits en el fragmento (`#…`), que no viaja al servidor en la URL. El cliente elimina el fragmento y lo intercambia por una cookie HttpOnly, Secure en HTTPS y SameSite=Strict. No hay cuentas ni contraseñas.

El enlace es reutilizable durante 90 días y consulta también los pedidos futuros de la misma dirección. La cookie dura como máximo siete días; el enlace permite volver a entrar. Cerrar acceso borra la cookie de ese navegador, sin invalidar el enlace del correo. Pedir otro enlace tampoco invalida los anteriores. La expiración del token se verifica en cada consulta.

## Despliegue

Con la aplicación detenida o antes de reiniciarla con el código nuevo, desde la carpeta de la tienda:

```bash
git pull --ff-only
npm run migration:order-tracking
npm run build
pm2 restart mali-deco --update-env
```

Conservar el nombre, cwd y variables del proceso PM2 real. Detener la secuencia si falla la migración o compilación. La migración agrega un índice por correo a los pedidos existentes y crea las tablas de accesos, solicitudes y control de frecuencia. No cambia pagos, stock ni estados. No requiere secretos nuevos; usa la configuración transaccional existente (`ORDER_EMAIL_MODE`, remitente, clave y `ORDER_EMAIL_SITE_URL`). El origen de producción debe coincidir con `ORDER_EMAIL_SITE_URL`; en desarrollo se usa `ADMIN_ORIGIN`.

## Privacidad y envío

- Todas las direcciones válidas reciben la misma respuesta HTTP 202. La consulta de existencia se hace en el worker, después de responder. No se publica si el correo tiene compras.
- Un bloqueo transaccional limita solicitudes a una por minuto y tres por hora por correo, con un máximo global de 60 por hora. Los límites funcionan entre procesos y no dependen de cabeceras de IP reenviadas.
- Los tokens solo se guardan como SHA-256; no se guardan tokens en claro en la cola. Se generan al despachar y quedan en memoria únicamente para enviar el mensaje. Los POST rechazados o inciertos no se repiten automáticamente; el cliente puede solicitar otro enlace después del límite. Las solicitudes retienen estado, ID del proveedor y error acotado durante 90 días.
- Los enlaces se envían al correo solicitado, nunca a una dirección alternativa. En modo `test` solo se envían solicitudes de `ORDER_EMAIL_TEST_TO`; no se redirigen enlaces de otras personas a ese buzón. Las compras de prueba solo aparecen en accesos emitidos para el destinatario de pruebas.
- El índice y la comparación de correo usan minúsculas, trim y colación binaria. No se eliminan puntos ni sufijos `+`: direcciones diferentes conservan su propiedad.
- Cada consulta aplica el filtro de correo en SQL y devuelve 10 pedidos por página. Solo expone artículos, importes, comprador, domicilio de entrega, estados y seguimiento. No entrega notas internas, DNI, teléfono, credenciales, adjuntos operativos ni el snapshot completo.
- La página y API usan `private, no-store`, `noindex` y `no-referrer`; la pantalla de seguimiento no carga analytics. Los enlaces de transportistas solo admiten HTTPS sin credenciales. No reenviar el correo de acceso: es una credencial para leer los pedidos.

## Recorrido y validación

Desde el pie del sitio, el checkout y los emails de pedido se accede a `/seguimiento`. La lista muestra el estado actual del servidor, una línea horizontal de progreso y un detalle desplegable con pago, productos, envío y totales. Se actualiza manualmente o cada minuto mientras la pestaña está visible. Cancelaciones, reembolsos, disputas y devoluciones tienen estados explícitos. No realiza consultas nuevas a Mercado Pago ni crea despachos.

Pruebas: `node --import tsx --test src/modules/order-tracking/*.test.ts src/presentation/tracking/*.test.ts`.
La integración `tests/integration/order-tracking.integration.ts` requiere `TRACKING_LOCAL_INTEGRATION=1`, `NODE_ENV=development`, MariaDB en `127.0.0.1` y credenciales con permiso para crear y eliminar una base temporal; se ejecuta con `node --import tsx --test tests/integration/order-tracking.integration.ts`. Usa exclusivamente un proveedor de correo sintético. El recorrido de navegador `node tests/journeys/order-tracking.mjs` requiere `CHROMIUM_EXECUTABLE` apuntando a Chromium/Chrome instalado, abre fixtures sin conexión, sustituye todas las respuestas de fetch y no envía emails reales. Guarda capturas de escritorio y móvil en `.local-tools/tracking-ui`.
